window.MinusBook = window.MinusBook || {};

/* ======================================================
   일별 복구 뷰

   - 앱을 열면 오늘 날짜로 바로 뜬다
   - 입력은 "오늘의 복구"와 "리베이트" 두 칸 — 둘 다
     직접 적는다 (리베이트는 자동 계산하지 않는다)
   - 입력하는 즉시 오늘 복구 금액(복구+리베이트)과
     리베이트 제외/포함 두 가지 남은 손실이 계산된다
   - 모든 주요 금액 아래에 실시간 환율로 환산한
     원화 금액이 함께 표시된다
   ====================================================== */

MinusBook.DayView = (() => {
    const Calc = MinusBook.Calc;
    const Data = MinusBook.Data;

    /* 현재 보고 있는 날짜 (Date 객체) */
    let currentDate = new Date();

    function setDate(date) {
        currentDate = date;
    }

    function getDate() {
        return currentDate;
    }

    function moveDay(offset) {
        const d = new Date(currentDate);

        d.setDate(d.getDate() + offset);

        currentDate = d;
    }

    function isToday() {
        return Calc.dateKey(currentDate) ===
            Calc.dateKey(new Date());
    }

    /* ==================================================
       원화 보조 표시
       ================================================== */

    function krwSub(usdAmount) {
        const text = MinusBook.Rate.fmtKrw(Math.abs(usdAmount));

        if (!text) {
            return "";
        }

        return '<span class="krw-sub">' + text + '</span>';
    }

    /* ==================================================
       포지션 화면 도우미
       ================================================== */

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(
            /[&<>"']/g,
            character => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[character]
        );
    }

    function symbolOptionsHtml(selectedSymbol, placeholder) {
        const selected = String(selectedSymbol || "").trim().toUpperCase();
        const symbols = Array.from(
            new Set(Data.getSymbols().concat(selected ? [selected] : []))
        ).sort((a, b) => a.localeCompare(b, "ko"));

        return (
            '<option value="">' + escapeHtml(placeholder) + '</option>' +
            symbols.map(symbol =>
                '<option value="' + escapeHtml(symbol) + '"' +
                    (symbol === selected ? ' selected' : '') +
                    '>' + escapeHtml(symbol) + '</option>'
            ).join("")
        );
    }

    function positionRowHtml(position, index) {
        const symbol = position.symbol || "";
        const side = position.side === "Sell" ? "Sell" : "Buy";
        const pnl = position.pnl == null ? "" : position.pnl;
        const lots = position.lots == null ? "" : position.lots;

        const legacyLots = position.legacyLots === true || (
            position.legacyLots == null &&
            position.lots == null &&
            position.pnl != null &&
            String(position.pnl).trim() !== ""
        );

        const pnlNumber = Number(pnl);
        const pnlClass = String(pnl).trim() === ""
            ? ""
            : pnlNumber < 0
                ? " is-loss"
                : pnlNumber > 0
                    ? " is-profit"
                    : "";

        return (
            '<div class="position-row" data-legacy-lots="' +
                (legacyLots ? '1' : '0') + '">' +
                '<span class="position-number">' + (index + 1) + '</span>' +
                '<select data-position-field="symbol" ' +
                    'aria-label="' + (index + 1) + '번 종목">' +
                    symbolOptionsHtml(symbol, "종목 선택") +
                '</select>' +
                '<select data-position-field="side" ' +
                    'aria-label="' + (index + 1) + '번 방향">' +
                    '<option value="Buy"' +
                        (side === "Buy" ? ' selected' : '') +
                        '>Buy</option>' +
                    '<option value="Sell"' +
                        (side === "Sell" ? ' selected' : '') +
                        '>Sell</option>' +
                '</select>' +
                '<input type="text" inputmode="decimal" ' +
                    'data-position-field="lots" autocomplete="off" ' +
                    'aria-label="' + (index + 1) + '번 랏수" ' +
                    'placeholder="' + (legacyLots ? '미입력' : '랏수') + '" ' +
                    'value="' + escapeHtml(lots) + '">' +
                '<input type="text" inputmode="decimal" ' +
                    'class="' + pnlClass.trim() + '" ' +
                    'data-position-field="pnl" autocomplete="off" ' +
                    'aria-label="' + (index + 1) + '번 손익 USD" ' +
                    'placeholder="손익 ±" ' +
                    'value="' + escapeHtml(pnl) + '">' +
                '<button type="button" class="position-remove" ' +
                    'data-remove-position="' + index + '" ' +
                    'aria-label="' + (index + 1) + '번 기록 삭제">×</button>' +
            '</div>'
        );
    }

    function positionsHtml(entry) {
        const positions = entry && Array.isArray(entry.positions)
            ? entry.positions
            : [];
        const legacyRecover = entry && entry.recover
            ? entry.recover
            : 0;

        const legacyHtml = legacyRecover !== 0
            ? (
                '<div class="field">' +
                    '<label for="f-recover">기존 일괄 복구액 (USD)</label>' +
                    '<div class="money-input-wrap">' +
                        '<input id="f-recover" type="number" ' +
                            'inputmode="decimal" step="0.01" ' +
                            'value="' + legacyRecover + '">' +
                        '<span class="won">$</span>' +
                    '</div>' +
                    '<p class="field-hint">' +
                        '이전 기록은 그대로 유지됩니다. 아래 포지션은 ' +
                        '이 금액에 추가로 합산되며, 기존 금액의 진입 횟수는 ' +
                        '집계하지 않습니다.' +
                    '</p>' +
                '</div>'
            )
            : '<input id="f-recover" type="hidden" value="0">';

        return (
            legacyHtml +
            '<div class="position-toolbar">' +
                '<h3>포지션별 손익</h3>' +
                '<span class="position-count" id="position-count">' +
                    '진입 ' + positions.length + '회' +
                '</span>' +
            '</div>' +
            '<div class="symbol-manager">' +
                '<select id="manage-symbol" aria-label="관리할 종목">' +
                    symbolOptionsHtml("", "저장된 종목") +
                '</select>' +
                '<button type="button" class="position-small-button" ' +
                    'id="add-symbol">종목 추가</button>' +
                '<button type="button" class="position-small-button" ' +
                    'id="rename-symbol">이름 변경</button>' +
            '</div>' +
            '<div class="position-sheet">' +
                '<div class="position-sheet-header" aria-hidden="true">' +
                    '<span>번호</span>' +
                    '<span>종목</span>' +
                    '<span>방향</span>' +
                    '<span>랏수</span>' +
                    '<span>손익 USD</span>' +
                    '<span></span>' +
                '</div>' +
                '<div class="position-list" id="position-list">' +
                    (positions.length > 0
                        ? positions.map(positionRowHtml).join("")
                        : '<p class="position-empty">+ 줄 추가로 기록하세요.</p>') +
                '</div>' +
            '</div>' +
            '<button type="button" class="position-small-button" ' +
                'id="add-position">+ 줄 추가</button>' +
            '<p class="field-hint position-help">' +
                '종목은 한 번 추가하면 목록에서 선택할 수 있습니다. ' +
                '손실은 음수로 입력하세요. ' +
                '이름 변경은 저장된 과거 기록에도 적용됩니다.' +
            '</p>'
        );
    }

    function readPositionRows(container, validate) {
        const positions = [];
        const rows = container.querySelectorAll(".position-row");

        rows.forEach((row, index) => {
            const symbolInput = row.querySelector(
                '[data-position-field="symbol"]'
            );
            const sideInput = row.querySelector(
                '[data-position-field="side"]'
            );
            const lotsInput = row.querySelector(
                '[data-position-field="lots"]'
            );
            const pnlInput = row.querySelector(
                '[data-position-field="pnl"]'
            );

            const symbol = symbolInput.value.trim().toUpperCase();
            const side = sideInput.value;
            const rawLots = lotsInput.value.trim();
            const rawPnl = pnlInput.value.trim();
            const lots = Number(rawLots);
            const pnl = Number(rawPnl);

            const validPnl =
                /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(rawPnl) &&
                Number.isFinite(pnl) &&
                Number.isSafeInteger(Math.round(pnl * 100));

            const omittedLegacyLots =
                rawLots === "" &&
                row.dataset.legacyLots === "1";

            const validLots = omittedLegacyLots || (
                /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(rawLots) &&
                Number.isFinite(lots) &&
                lots > 0
            );

            const validSide = side === "Buy" || side === "Sell";

            if (
                validate &&
                (!symbol || !validSide || !validLots || !validPnl)
            ) {
                let target;
                let message;

                if (!symbol) {
                    target = symbolInput;
                    message = "종목을 선택하세요.";
                } else if (!validSide) {
                    target = sideInput;
                    message = "Buy 또는 Sell을 선택하세요.";
                } else if (!validLots) {
                    target = lotsInput;
                    message = "랏수는 0보다 큰 숫자로 입력하세요.";
                } else {
                    target = pnlInput;
                    message = "손익을 숫자로 입력하세요. 손익이 없으면 0입니다.";
                }

                target.focus();

                throw new Error((index + 1) + "번 기록: " + message);
            }

            if (symbol && validSide && validLots && validPnl) {
                const position = {
                    no: positions.length + 1,
                    symbol: symbol,
                    side: side,
                    pnl: Math.round(pnl * 100) / 100
                };

                if (!omittedLegacyLots) {
                    position.lots = lots;
                }

                positions.push(position);
            }
        });

        return positions;
    }

    function readPositionDrafts(container) {
        return Array.from(
            container.querySelectorAll(".position-row")
        ).map(row => ({
            symbol: row.querySelector(
                '[data-position-field="symbol"]'
            ).value,
            side: row.querySelector(
                '[data-position-field="side"]'
            ).value,
            lots: row.querySelector(
                '[data-position-field="lots"]'
            ).value,
            pnl: row.querySelector(
                '[data-position-field="pnl"]'
            ).value,
            legacyLots: row.dataset.legacyLots === "1"
        }));
    }

    function renderPositionDrafts(container, positions) {
        container.querySelector("#position-list").innerHTML =
            positions.length > 0
                ? positions.map(positionRowHtml).join("")
                : '<p class="position-empty">+ 줄 추가로 기록하세요.</p>';

        refreshCalc(container);
    }

    /* ==================================================
       렌더링
       ================================================== */

    function render(container) {
        const key = Calc.dateKey(currentDate);
        const entry = Data.getEntry(key);
        const hasEntry = Boolean(entry);

        const weekday = Calc.weekdayName(currentDate);
        const dayOfWeek = currentDate.getDay();
        const weekdayClass =
            dayOfWeek === 0 ? "sun" : dayOfWeek === 6 ? "sat" : "";

        container.innerHTML =
            '<section class="panel">' +
                '<div class="day-header">' +
                    '<button type="button" class="day-nav-btn" ' +
                        'id="prev-day" aria-label="전날">◀</button>' +

                    '<div class="day-title">' +
                        '<span class="date">' +
                            (currentDate.getMonth() + 1) + "월 " +
                            currentDate.getDate() + "일" +
                        '</span>' +
                        '<span class="weekday ' + weekdayClass + '">' +
                            weekday + "요일" +
                        '</span>' +
                        (isToday()
                            ? '<span class="today-pill">오늘</span>'
                            : "") +
                    '</div>' +

                    '<button type="button" class="day-nav-btn" ' +
                        'id="next-day" aria-label="다음날">▶</button>' +
                '</div>' +

                positionsHtml(entry) +

                '<div class="field">' +
                    '<label for="f-rebate">리베이트 (USD, 직접 입력)</label>' +
                    '<div class="money-input-wrap">' +
                        '<input id="f-rebate" type="number" ' +
                            'inputmode="decimal" step="0.01" min="0" ' +
                            'placeholder="0.00" ' +
                            'value="' + fieldOrEmpty(entry, "rebate") + '">' +
                        '<span class="won">$</span>' +
                    '</div>' +
                '</div>' +

                /* 입력 직후 바로 저장할 수 있도록 여기에 둔다 */
                '<div class="button-row form-actions">' +
                    '<button type="button" class="action-button" ' +
                        'id="save-entry">저장</button>' +
                '</div>' +

                '<div class="field">' +
                    '<label for="f-note">메모 (선택)</label>' +
                    '<div class="money-input-wrap">' +
                        '<input id="f-note" type="text" ' +
                            'class="text-input" ' +
                            'placeholder="예: 나스닥 선물 scalping 복구분" ' +
                            'value="' +
                                escapeHtml(entry && entry.note ? entry.note : "") +
                            '">' +
                    '</div>' +
                '</div>' +

                '<div class="calc-preview" id="calc-preview"></div>' +

                (hasEntry
                    ? '<div class="button-row">' +
                      '<button type="button" ' +
                          'class="action-button danger" ' +
                          'id="delete-entry">이 날 기록 삭제</button>' +
                      '</div>'
                    : "") +
            '</section>' +

            /* 전체 복구 현황 (리베이트 제외 / 포함 기준) */
            MinusBook.App.statusHtml();

        bindEvents(container);
        refreshCalc(container);
    }

    function fieldOrEmpty(entry, field) {
        if (!entry || !entry[field]) {
            return "";
        }

        return entry[field];
    }

    /* ==================================================
       폼 읽기 / 실시간 계산
       ================================================== */

    function readForm(container, validate = false) {
        const recoverInput = container.querySelector("#f-recover");
        const rebateInput = container.querySelector("#f-rebate");

        if (validate) {
            [recoverInput, rebateInput].forEach(input => {
                const value = input.value.trim();

                if (
                    !input.validity.valid ||
                    (value !== "" && !Number.isFinite(Number(value))) ||
                    !Number.isSafeInteger(
                        Math.round(Number(value || 0) * 100)
                    )
                ) {
                    input.focus();
                    throw new Error("복구액 또는 리베이트 금액을 확인해 주세요.");
                }
            });
        }

        return {
            recover: recoverInput.value,
            rebate: rebateInput.value,
            note: container.querySelector("#f-note").value,
            positions: readPositionRows(container, validate)
        };
    }

    function refreshCalc(container) {
        const key = Calc.dateKey(currentDate);
        const form = readForm(container);
        const loss = Data.getLossAmount();

        const result = Calc.day(form);

        const rowCount = container.querySelectorAll(".position-row").length;

        container.querySelector("#position-count").textContent =
            "진입 " + result.trades + "회" +
            (rowCount > result.trades
                ? " · 입력 중 " + (rowCount - result.trades) + "개"
                : "");

        /* 이 날 "직전까지"의 누계 (이 날 저장값은 빼고 계산) */
        const entries = Object.assign({}, Data.getState().entries);

        delete entries[key];

        const base = Calc.totals(entries, key);

        /* 폼 값까지 반영한 이 날 기준 남은 손실 */
        const pureRemaining =
            loss - (base.recover + result.recover);
        const remaining =
            loss - (base.total + result.total);

        container.querySelector("#calc-preview").innerHTML =
            '<div class="calc-row">' +
                '<span>진입 횟수</span>' +
                '<span class="value">' + result.trades + '회</span>' +
            '</div>' +
            '<div class="calc-row">' +
                '<span>포지션 손익 합계</span>' +
                '<span class="value ' +
                    (result.positionTotal < 0 ? 'loss' : 'profit') + '">' +
                    Calc.usd(result.positionTotal) +
                '</span>' +
            '</div>' +
            '<div class="calc-row">' +
                '<span>오늘의 복구 (기존 금액 + 포지션)</span>' +
                '<span class="value ' +
                    (result.recover < 0 ? 'loss' : 'profit') + '">' +
                    Calc.usd(result.recover) +
                '</span>' +
            '</div>' +
            '<div class="calc-row rebate">' +
                '<span>리베이트</span>' +
                '<span class="value">+' +
                    Calc.usd(result.rebate) +
                '</span>' +
            '</div>' +
            '<div class="calc-row applied">' +
                '<span>오늘 복구 금액 (복구 + 리베이트)</span>' +
                '<span class="value">' +
                    Calc.usd(result.total) +
                    krwSub(result.total) +
                '</span>' +
            '</div>' +
            '<div class="calc-row balance">' +
                '<span>남은 손실 (리베이트 제외)</span>' +
                '<span class="value ' +
                    Calc.remainingClass(pureRemaining) + '">' +
                    Calc.remainingText(pureRemaining) +
                '</span>' +
            '</div>' +
            '<div class="calc-row net balance">' +
                '<span>남은 손실 (리베이트 포함)</span>' +
                '<span class="value ' +
                    Calc.remainingClass(remaining) + '">' +
                    Calc.remainingText(remaining) +
                    krwSub(remaining) +
                '</span>' +
            '</div>';
    }

    function isFormEmpty(container) {
        const form = readForm(container);

        return (
            Number(form.recover || 0) === 0 &&
            Number(form.rebate || 0) === 0 &&
            !form.note.trim() &&
            container.querySelectorAll(".position-row").length === 0
        );
    }

    /* ==================================================
       이벤트
       ================================================== */

    function bindEvents(container) {
        const positionList = container.querySelector("#position-list");

        async function runSymbolAction(action, from, to) {
            const drafts = readPositionDrafts(container);
            const manager = container.querySelector("#manage-symbol");
            const controls = Array.from(
                container.querySelectorAll("input, select, button")
            ).concat(Array.from(
                document.querySelectorAll(".nav-button")
            ));
            const previousDisabled = controls.map(control => control.disabled);

            controls.forEach(control => {
                control.disabled = true;
            });

            try {
                const result = action === "rename"
                    ? await Data.renameSymbol(from, to)
                    : await Data.saveSymbol(to);

                if (!manager.isConnected) {
                    return;
                }

                if (action === "rename") {
                    drafts.forEach(position => {
                        if (position.symbol === from) {
                            position.symbol = to;
                        }
                    });
                }

                manager.innerHTML = symbolOptionsHtml(to, "저장된 종목");
                renderPositionDrafts(container, drafts);
                MinusBook.App.afterSync(result);
            } catch (error) {
                MinusBook.App.showToast(error.message);
            } finally {
                controls.forEach((control, index) => {
                    if (control.isConnected) {
                        control.disabled = previousDisabled[index];
                    }
                });
            }
        }

        container.querySelector("#add-symbol")
            .addEventListener("click", async () => {
                const input = window.prompt("추가할 종목명을 입력하세요.");

                if (input === null) {
                    return;
                }

                const name = input.trim().toUpperCase();

                if (!name || name.length > 80) {
                    MinusBook.App.showToast("종목명은 1~80자로 입력하세요.");
                    return;
                }

                await runSymbolAction("add", "", name);
            });

        container.querySelector("#rename-symbol")
            .addEventListener("click", async () => {
                const from = container.querySelector("#manage-symbol").value;

                if (!from) {
                    MinusBook.App.showToast("이름을 변경할 종목을 먼저 선택하세요.");
                    return;
                }

                const input = window.prompt(
                    "새 종목명을 입력하세요. 저장된 과거 기록도 함께 변경됩니다.",
                    from
                );

                if (input === null) {
                    return;
                }

                const to = input.trim().toUpperCase();

                if (!to || to.length > 80) {
                    MinusBook.App.showToast("종목명은 1~80자로 입력하세요.");
                    return;
                }

                if (from === to) {
                    return;
                }

                if (
                    Data.getSymbols().includes(to) &&
                    !window.confirm(
                        to + " 종목이 이미 있습니다. 해당 종목으로 합칠까요?"
                    )
                ) {
                    return;
                }

                await runSymbolAction("rename", from, to);
            });

        container.querySelector("#add-position")
            .addEventListener("click", () => {
                const drafts = readPositionDrafts(container);
                const previous = drafts[drafts.length - 1];
                const managedSymbol = container.querySelector("#manage-symbol").value;

                drafts.push({
                    symbol: managedSymbol || (previous ? previous.symbol : ""),
                    side: previous ? previous.side : "Buy",
                    lots: previous ? previous.lots : "",
                    pnl: "",
                    legacyLots: false
                });

                renderPositionDrafts(container, drafts);

                const lastRow = container.querySelector(
                    ".position-row:last-child"
                );

                lastRow.querySelector(
                    '[data-position-field="symbol"]'
                ).focus();
            });

        positionList.addEventListener("input", event => {
            if (event.target.matches('[data-position-field="pnl"]')) {
                const input = event.target;
                const raw = input.value.trim();
                const value = Number(raw);

                input.classList.toggle(
                    "is-profit",
                    raw !== "" && Number.isFinite(value) && value > 0
                );
                input.classList.toggle(
                    "is-loss",
                    raw !== "" && Number.isFinite(value) && value < 0
                );
            }

            refreshCalc(container);
        });

        positionList.addEventListener("change", () => {
            refreshCalc(container);
        });

        positionList.addEventListener("focusin", event => {
            if (
                event.target.matches(
                    '[data-position-field="pnl"], [data-position-field="lots"]'
                )
            ) {
                event.target.select();
            }
        });

        positionList.addEventListener("click", event => {
            const button = event.target.closest("[data-remove-position]");

            if (!button) {
                return;
            }

            const index = Number(button.dataset.removePosition);
            const drafts = readPositionDrafts(container);

            if (
                !window.confirm(
                    (index + 1) + "번 기록을 삭제할까요? 저장하면 반영됩니다."
                )
            ) {
                return;
            }

            drafts.splice(index, 1);
            renderPositionDrafts(container, drafts);
        });

        /* 터치 한 번으로 전체 선택 → 바로 새 값 입력 */
        container
            .querySelectorAll('input[type="number"]')
            .forEach(el => {
                const selectAll = () => {
                    el.select();
                };

                el.addEventListener("focus", selectAll);
                el.addEventListener("click", selectAll);

                el.addEventListener("input", () => {
                    refreshCalc(container);
                });
            });

        container
            .querySelector("#f-note")
            .addEventListener("input", () => {
                refreshCalc(container);
            });

        container
            .querySelector("#prev-day")
            .addEventListener("click", () => {
                moveDay(-1);
                render(container);
            });

        container
            .querySelector("#next-day")
            .addEventListener("click", () => {
                moveDay(1);
                render(container);
            });

        container
            .querySelector("#save-entry")
            .addEventListener("click", async () => {
                const key = Calc.dateKey(currentDate);
                const button = container.querySelector("#save-entry");

                let form;

                try {
                    form = readForm(container, true);
                } catch (error) {
                    MinusBook.App.showToast(error.message);
                    return;
                }

                if (isFormEmpty(container)) {
                    MinusBook.App.showToast(
                        "입력된 내용이 없습니다. 전체 삭제는 기록 삭제 버튼을 사용하세요."
                    );
                    return;
                }

                const controls = Array.from(
                    container.querySelectorAll("input, select, button")
                ).concat(Array.from(
                    document.querySelectorAll(".nav-button")
                ));
                const previousDisabled = controls.map(control => control.disabled);

                controls.forEach(control => {
                    control.disabled = true;
                });
                button.textContent = "저장 중...";

                try {
                    const result = await Data.saveEntry(key, form);

                    MinusBook.App.afterSync(result);

                    if (
                        button.isConnected &&
                        Calc.dateKey(currentDate) === key
                    ) {
                        render(container);
                    }
                } catch (error) {
                    MinusBook.App.showToast(
                        "저장 중 오류가 발생했습니다. " + error.message
                    );
                } finally {
                    controls.forEach((control, index) => {
                        if (control.isConnected) {
                            control.disabled = previousDisabled[index];
                        }
                    });

                    if (button.isConnected) {
                        button.textContent = "저장";
                    }
                }
            });

        const deleteButton = container.querySelector("#delete-entry");

        if (deleteButton) {
            deleteButton.addEventListener("click", async () => {
                const label =
                    (currentDate.getMonth() + 1) + "월 " +
                    currentDate.getDate() + "일";

                const ok = window.confirm(
                    label + " 기록을 삭제할까요?"
                );

                if (!ok) {
                    return;
                }

                const key = Calc.dateKey(currentDate);

                const result = await Data.saveEntry(key, null);

                MinusBook.App.afterSync(result);

                render(container);
            });
        }
    }

    return Object.freeze({ render, setDate, getDate });
})();