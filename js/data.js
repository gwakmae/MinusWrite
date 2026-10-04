window.MinusBook = window.MinusBook || {};

/* ======================================================
   데이터 저장소

   - 진짜 데이터는 GitHub 저장소의 data/recovery-entries.json에 있다
   - 읽기: Pages에서 fetch (토큰 불필요)
   - 쓰기: GitHub Contents API (토큰 필요)
   - 토큰은 이 브라우저 localStorage에만 보관된다
   - 저장 실패 시 변경분을 기기에 보관했다가 다음에 재시도
   ====================================================== */

MinusBook.Data = (() => {
    const TOKEN_KEY = "minus_book_gh_token";
    const PENDING_KEY = "minus_book_pending";
    const DATA_PATH = "data/recovery-entries.json";

    const DEFAULT_LOSS = 1000000; /* 손실금액 기본값 (양수) */

    /* 메모리상의 현재 상태 */
    let state = {
        lossAmount: DEFAULT_LOSS,
        entries: {},
        symbols: []
    };

    /* 동기화 상태: ok / pending / error */
    let syncState = "pending";

    /* ==================================================
       토큰
       ================================================== */

    function getToken() {
        try {
            return localStorage.getItem(TOKEN_KEY) || "";
        } catch (e) {
            return "";
        }
    }

    function setToken(token) {
        try {
            if (token) {
                localStorage.setItem(TOKEN_KEY, token);
            } else {
                localStorage.removeItem(TOKEN_KEY);
            }
        } catch (e) {
            // localStorage 불가 환경이면 무시
        }
    }

    /* ==================================================
       미동기 변경분 (기기에 임시 보관)
       { upserts: {dateKey: entry}, deletes: [dateKey],
         settings: null | {lossAmount}, symbols: [symbol],
         symbolRenames: [{from, to}] }
       ================================================== */

    function emptyPending() {
        return {
            upserts: {},
            deletes: [],
            settings: null,
            symbols: [],
            symbolRenames: []
        };
    }

    function getPending() {
        try {
            const raw = localStorage.getItem(PENDING_KEY);

            if (!raw) {
                return emptyPending();
            }

            const parsed = JSON.parse(raw);

            return {
                upserts: parsed.upserts || {},
                deletes: parsed.deletes || [],
                settings: parsed.settings || null,
                symbols: mergeSymbols(parsed.symbols),
                symbolRenames: normalizeSymbolRenames(parsed.symbolRenames)
            };
        } catch (e) {
            return emptyPending();
        }
    }

    function setPending(pending) {
        try {
            const empty =
                Object.keys(pending.upserts).length === 0 &&
                pending.deletes.length === 0 &&
                pending.settings === null &&
                mergeSymbols(pending.symbols).length === 0 &&
                normalizeSymbolRenames(pending.symbolRenames).length === 0;

            if (empty) {
                localStorage.removeItem(PENDING_KEY);
            } else {
                localStorage.setItem(
                    PENDING_KEY,
                    JSON.stringify(pending)
                );
            }
        } catch (e) {
            // 무시
        }
    }

    function hasPending() {
        const p = getPending();

        return (
            Object.keys(p.upserts).length > 0 ||
            p.deletes.length > 0 ||
            p.settings !== null ||
            p.symbols.length > 0 ||
            p.symbolRenames.length > 0
        );
    }

    /* ==================================================
       현재 Pages가 서빙되는 저장소 추론
       gwakmae.github.io/minus-book/
       → { owner: "gwakmae", repo: "minus-book" }
       ================================================== */

    function hubRepo() {
        const match = location.hostname.match(
            /^([^.]+)\.github\.io$/
        );

        if (!match) {
            return null;
        }

        const owner = match[1];
        const seg = location.pathname
            .split("/")
            .filter(Boolean)[0];
        const repo = seg || owner + ".github.io";

        return { owner: owner, repo: repo };
    }

    /* ==================================================
       UTF-8 안전 base64
       ================================================== */

    function textToBase64(text) {
        const bytes = new TextEncoder().encode(text);
        let binary = "";

        bytes.forEach(b => {
            binary += String.fromCharCode(b);
        });

        return btoa(binary);
    }

    function base64ToText(base64) {
        const binary = atob(base64.replace(/\s/g, ""));
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        return new TextDecoder().decode(bytes);
    }

    /* ==================================================
       데이터 정규화 (빈 값 제거)

       옛 버전 필드(deposit, profit)는 recover로 흡수한다.
       ================================================== */

    function mergeSymbols(...lists) {
        const symbols = new Set();

        lists.forEach(list => {
            if (!Array.isArray(list)) {
                return;
            }

            list.forEach(value => {
                if (typeof value !== "string") {
                    return;
                }

                const symbol = value.trim().toUpperCase();

                if (symbol) {
                    symbols.add(symbol);
                }
            });
        });

        return Array.from(symbols).sort((a, b) =>
            a.localeCompare(b, "ko")
        );
    }

    function normalizeSymbolRenames(value) {
        if (!Array.isArray(value)) {
            return [];
        }

        return value.reduce((result, item) => {
            if (!item || typeof item !== "object") {
                return result;
            }

            const from = String(item.from || "").trim().toUpperCase();
            const to = String(item.to || "").trim().toUpperCase();

            if (from && to && from !== to) {
                result.push({ from: from, to: to });
            }

            return result;
        }, []);
    }

    function applySymbolRenames(target, renames) {
        normalizeSymbolRenames(renames).forEach(rename => {
            target.symbols = mergeSymbols(
                (target.symbols || []).map(symbol =>
                    symbol === rename.from ? rename.to : symbol
                ),
                [rename.to]
            );

            Object.values(target.entries || {}).forEach(entry => {
                if (!entry || !Array.isArray(entry.positions)) {
                    return;
                }

                entry.positions.forEach(position => {
                    if (position.symbol === rename.from) {
                        position.symbol = rename.to;
                    }
                });
            });
        });

        target.symbols = mergeSymbols(
            target.symbols,
            symbolsFromEntries(target.entries)
        );
    }

    async function saveSymbol(name) {
        const symbol = String(name || "").trim().toUpperCase();

        if (!symbol || symbol.length > 80) {
            throw new Error("종목명은 1~80자로 입력하세요.");
        }

        const pending = getPending();

        state.symbols = mergeSymbols(state.symbols, [symbol]);
        pending.symbols = mergeSymbols(pending.symbols, [symbol]);

        setPending(pending);

        return sync();
    }

    async function renameSymbol(oldName, newName) {
        const from = String(oldName || "").trim().toUpperCase();
        const to = String(newName || "").trim().toUpperCase();

        if (!from || !getSymbols().includes(from)) {
            throw new Error("변경할 종목을 선택하세요.");
        }

        if (!to || to.length > 80) {
            throw new Error("종목명은 1~80자로 입력하세요.");
        }

        if (from === to) {
            return { ok: true, skipped: true };
        }

        const pending = getPending();
        const rename = { from: from, to: to };

        applySymbolRenames(state, [rename]);

        pending.symbols = mergeSymbols(
            pending.symbols.map(symbol => symbol === from ? to : symbol),
            [to]
        );
        pending.symbolRenames.push(rename);

        const pendingState = {
            entries: pending.upserts,
            symbols: pending.symbols
        };

        applySymbolRenames(pendingState, [rename]);
        pending.symbols = pendingState.symbols;

        setPending(pending);

        return sync();
    }

    function symbolsFromEntries(entries) {
        const symbols = [];

        Object.values(entries || {}).forEach(entry => {
            if (!entry || !Array.isArray(entry.positions)) {
                return;
            }

            entry.positions.forEach(position => {
                symbols.push(position.symbol);
            });
        });

        return mergeSymbols(symbols);
    }

    function getSymbols() {
        return mergeSymbols(
            state.symbols,
            symbolsFromEntries(state.entries)
        );
    }

    function normalizeEntry(entry) {
        if (!entry || typeof entry !== "object") {
            return null;
        }

        const cleaned = {};

        let rawRecover = entry.recover;

        if (rawRecover == null && entry.profit != null) {
            rawRecover = entry.profit;
        }

        if (rawRecover == null && entry.deposit != null) {
            rawRecover = entry.deposit;
        }

        const recover = Number(rawRecover);

        if (Number.isFinite(recover) && recover !== 0) {
            cleaned.recover = Math.round(recover * 100) / 100;
        }

        const rebate = Number(entry.rebate);

        if (Number.isFinite(rebate) && rebate !== 0) {
            cleaned.rebate = Math.round(rebate * 100) / 100;
        }

        if (Array.isArray(entry.positions)) {
            const positions = [];

            entry.positions.forEach(position => {
                if (!position || typeof position !== "object") {
                    return;
                }

                const symbol = String(position.symbol || "")
                    .trim()
                    .toUpperCase();
                const side = position.side;
                const rawPnl = position.pnl;

                if (
                    !symbol ||
                    (side !== "Buy" && side !== "Sell") ||
                    rawPnl == null ||
                    String(rawPnl).trim() === ""
                ) {
                    return;
                }

                const pnl = Number(rawPnl);

                if (
                    !Number.isFinite(pnl) ||
                    !Number.isSafeInteger(Math.round(pnl * 100))
                ) {
                    return;
                }

                const normalizedPosition = {
                    no: positions.length + 1,
                    symbol: symbol,
                    side: side,
                    pnl: Math.round(pnl * 100) / 100
                };

                const rawLots = position.lots;
                const lots = Number(rawLots);

                if (
                    rawLots != null &&
                    String(rawLots).trim() !== "" &&
                    Number.isFinite(lots) &&
                    lots > 0
                ) {
                    normalizedPosition.lots = lots;
                }

                positions.push(normalizedPosition);
            });

            if (positions.length > 0) {
                cleaned.positions = positions;
            }
        }

        if (entry.note && String(entry.note).trim()) {
            cleaned.note = String(entry.note).trim();
        }

        return Object.keys(cleaned).length > 0 ? cleaned : null;
    }

    function normalizeState(remote) {
        let lossAmount = DEFAULT_LOSS;

        if (typeof remote.lossAmount === "number") {
            lossAmount = Math.abs(remote.lossAmount);
        } else if (typeof remote.startBalance === "number") {
            /* 옛 버전: 음수 시작 잔액 → 양수 손실금액으로 변환 */
            lossAmount = Math.abs(remote.startBalance);
        }

        const entries = {};
        const rawEntries = remote.entries || {};

        Object.keys(rawEntries).forEach(key => {
            const cleaned = normalizeEntry(rawEntries[key]);

            if (cleaned) {
                entries[key] = cleaned;
            }
        });

        return {
            lossAmount: lossAmount,
            entries: entries,
            symbols: mergeSymbols(
                remote.symbols,
                symbolsFromEntries(entries)
            )
        };
    }

    /* ==================================================
       읽기
       ================================================== */

    async function load() {
        const pending = getPending();

        try {
            const res = await fetch(
                DATA_PATH + "?ts=" + Date.now(),
                { cache: "no-store" }
            );

            if (!res.ok) {
                throw new Error("데이터 읽기 실패 (" + res.status + ")");
            }

            state = normalizeState(await res.json());

            /* 아직 동기화 안 된 기기 변경분을 얹는다 */
            applyPendingToState(pending);

            syncState = hasPending() ? "pending" : "ok";
        } catch (e) {
            /* 첫 실행 등 실패 시 로컬 pending이라도 표시 */
            applyPendingToState(pending);

            syncState = "error";
        }

        return state;
    }

    function applyPendingToState(pending) {
        if (pending.settings) {
            state.lossAmount = pending.settings.lossAmount;
        }

        Object.keys(pending.upserts).forEach(key => {
            state.entries[key] = pending.upserts[key];
        });

        pending.deletes.forEach(key => {
            delete state.entries[key];
        });

        state.symbols = mergeSymbols(
            state.symbols,
            pending.symbols,
            symbolsFromEntries(state.entries)
        );

        applySymbolRenames(state, pending.symbolRenames);
    }

    /* ==================================================
       읽기 접근자
       ================================================== */

    function getState() {
        return state;
    }

    function getEntry(key) {
        return state.entries[key] || null;
    }

    function getSymbols() {
        return mergeSymbols(
            state.symbols,
            symbolsFromEntries(state.entries)
        );
    }

    function getLossAmount() {
        return state.lossAmount;
    }

    function getSyncState() {
        return syncState;
    }

    /* ==================================================
       쓰기: 로컬 상태 갱신 + pending 기록 + 동기화 시도
       ================================================== */

    /* 하루 기록 저장 (entry가 null이면 삭제) */
    async function saveEntry(key, entry) {
        const cleaned = entry ? normalizeEntry(entry) : null;
        const pending = getPending();

        if (cleaned) {
            state.entries[key] = cleaned;
            pending.upserts[key] = cleaned;
            pending.deletes = pending.deletes.filter(
                d => d !== key
            );
        } else {
            delete state.entries[key];
            delete pending.upserts[key];

            if (!pending.deletes.includes(key)) {
                pending.deletes.push(key);
            }
        }

        const entrySymbols = cleaned && cleaned.positions
            ? cleaned.positions.map(position => position.symbol)
            : [];

        state.symbols = mergeSymbols(state.symbols, entrySymbols);
        pending.symbols = mergeSymbols(pending.symbols, entrySymbols);

        setPending(pending);

        return sync();
    }

    /* 손실금액 변경 (양수로 받는다) */
    async function saveSettings(lossAmount) {
        state.lossAmount = Math.abs(lossAmount);

        const pending = getPending();

        pending.settings = {
            lossAmount: state.lossAmount
        };

        setPending(pending);

        return sync();
    }

    /* ==================================================
       동기화: GitHub의 최신 파일과 pending을 병합해 업로드

       다른 기기에서 먼저 저장한 내용을 덮어쓰지 않도록
       매번 최신 원격 파일을 내려받은 뒤 pending만 얹는다.
       파일이 아직 없으면(404) 새로 만든다.
       ================================================== */

    async function sync() {
        const token = getToken();
        const pending = getPending();

        if (!hasPending()) {
            syncState = "ok";
            return { ok: true, skipped: true };
        }

        if (!token) {
            syncState = "pending";
            return {
                ok: false,
                reason: "토큰이 없어 이 기기에만 저장되어 있습니다."
            };
        }

        const hub = hubRepo();

        if (!hub) {
            syncState = "pending";
            return {
                ok: false,
                reason: "github.io 주소가 아니어서 동기화할 수 없습니다."
            };
        }

        syncState = "pending";

        try {
            /* 1) 최신 원격 파일 + sha (없으면 새로 만든다) */
            const getRes = await fetch(
                "https://api.github.com/repos/" +
                    hub.owner + "/" + hub.repo +
                    "/contents/" + DATA_PATH,
                {
                    headers: {
                        Authorization: "Bearer " + token,
                        Accept: "application/vnd.github+json"
                    },
                    cache: "no-store"
                }
            );

            let merged;
            let sha = null;

            if (getRes.status === 404) {
                merged = normalizeState({});
            } else if (getRes.ok) {
                const fileData = await getRes.json();

                sha = fileData.sha;
                merged = normalizeState(
                    JSON.parse(base64ToText(fileData.content))
                );
            } else {
                throw new Error(
                    "원격 파일 확인 실패 (" + getRes.status + ")"
                );
            }

            if (pending.settings) {
                merged.lossAmount = pending.settings.lossAmount;
            }

            Object.keys(pending.upserts).forEach(key => {
                merged.entries[key] = pending.upserts[key];
            });

            pending.deletes.forEach(key => {
                delete merged.entries[key];
            });

            merged.symbols = mergeSymbols(
                merged.symbols,
                pending.symbols,
                symbolsFromEntries(merged.entries)
            );

            applySymbolRenames(merged, pending.symbolRenames);

            /* 날짜순 정렬 (보기 좋은 diff를 위해) */
            const sortedEntries = {};

            Object.keys(merged.entries)
                .sort()
                .forEach(key => {
                    sortedEntries[key] = merged.entries[key];
                });

            merged.entries = sortedEntries;

            /* 2) 업로드 */
            const body = {
                message: "data: 손실 복구 기록 업데이트",
                content: textToBase64(
                    JSON.stringify(merged, null, 2) + "\n"
                )
            };

            if (sha) {
                body.sha = sha;
            }

            const putRes = await fetch(
                "https://api.github.com/repos/" +
                    hub.owner + "/" + hub.repo +
                    "/contents/" + DATA_PATH,
                {
                    method: "PUT",
                    headers: {
                        Authorization: "Bearer " + token,
                        Accept: "application/vnd.github+json",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(body)
                }
            );

            if (!putRes.ok) {
                const errData = await putRes
                    .json()
                    .catch(() => ({}));

                throw new Error(
                    errData.message ||
                        "업로드 실패 (" + putRes.status + ")"
                );
            }

            /* 3) 성공: 메모리를 병합 결과로 교체, pending 비우기 */
            state = merged;

            setPending(emptyPending());

            syncState = "ok";

            return { ok: true };
        } catch (e) {
            syncState = "error";

            return { ok: false, reason: e.message };
        }
    }

    return Object.freeze({
        load,
        getState,
        getEntry,
        getSymbols,
        saveSymbol,
        renameSymbol,
        getLossAmount,
        getSyncState,
        hasPending,
        saveEntry,
        saveSettings,
        sync,
        getToken,
        setToken
    });
})();