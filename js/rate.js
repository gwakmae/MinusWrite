window.MinusBook = window.MinusBook || {};

/* ======================================================
   USD → KRW 실시간 환율

   - open.er-api.com 무료 API 사용 (키 불필요, CORS 허용)
   - 12시간 동안 localStorage에 캐시
   - 실패하면 마지막 캐시라도 사용, 그마저 없으면 원화 표시 생략
   ====================================================== */

MinusBook.Rate = (() => {
    const CACHE_KEY = "minus_book_usdkrw";
    const CACHE_TTL = 12 * 60 * 60 * 1000; /* 12시간 */

    let rate = null;      /* $1 = ?원 */
    let fetchedAt = null; /* 시각 (ms) */

    function readCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);

            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);

            if (
                typeof parsed.rate === "number" &&
                typeof parsed.ts === "number"
            ) {
                return parsed;
            }
        } catch (e) {
            // 무시
        }

        return null;
    }

    function writeCache(value, ts) {
        try {
            localStorage.setItem(
                CACHE_KEY,
                JSON.stringify({ rate: value, ts: ts })
            );
        } catch (e) {
            // 무시
        }
    }

    async function load() {
        const cached = readCache();
        const fresh =
            cached && Date.now() - cached.ts < CACHE_TTL;

        if (fresh) {
            rate = cached.rate;
            fetchedAt = cached.ts;
            return rate;
        }

        try {
            const res = await fetch(
                "https://open.er-api.com/v6/latest/USD",
                { cache: "no-store" }
            );

            if (!res.ok) {
                throw new Error("환율 응답 실패 (" + res.status + ")");
            }

            const data = await res.json();
            const krw = data && data.rates && data.rates.KRW;

            if (!Number.isFinite(krw)) {
                throw new Error("KRW 환율이 없습니다.");
            }

            rate = krw;
            fetchedAt = Date.now();

            writeCache(rate, fetchedAt);
        } catch (e) {
            /* 실패 시 오래된 캐시라도 사용 */
            if (cached) {
                rate = cached.rate;
                fetchedAt = cached.ts;
            }
        }

        return rate;
    }

    function get() {
        return rate;
    }

    function getFetchedAt() {
        return fetchedAt;
    }

    /* 달러 → 원화 숫자 (환율 없으면 null) */
    function krw(usdAmount) {
        if (!rate) {
            return null;
        }

        return usdAmount * rate;
    }

    /* "약 3,055,800원" (환율 없으면 빈 문자열) */
    function fmtKrw(usdAmount) {
        const k = krw(usdAmount);

        if (k == null) {
            return "";
        }

        return "약 " + Math.round(k).toLocaleString("ko-KR") + "원";
    }

    /* "$1 = 1,387원" */
    function fmtRate() {
        if (!rate) {
            return "";
        }

        return "$1 = " +
            Math.round(rate).toLocaleString("ko-KR") + "원";
    }

    return Object.freeze({
        load,
        get,
        getFetchedAt,
        krw,
        fmtKrw,
        fmtRate
    });
})();
