window.MinusBook = window.MinusBook || {};

/* ======================================================
   계산 로직 — 트레이딩 손실 복구 프로젝트

   - 하루: 복구(recover)와 리베이트(rebate)를 직접 입력
     (리베이트는 자동 계산이 아니라 손으로 적는다)
   - 총 복구 금액 = 복구 + 리베이트
   - 남은 손실(리베이트 제외) = 손실금액 - 순수 복구 누계
   - 남은 손실(리베이트 포함) = 손실금액 - (복구 + 리베이트) 누계
   - 남은 손실이 0 이하가 되면 "복구 완료"
   - 화폐 단위는 USD ($)
   ====================================================== */

MinusBook.Calc = (() => {
    function num(value) {
        const n = Number(value);

        return Number.isFinite(n) ? n : 0;
    }

    /* 하루치 계산. entry가 없으면(미입력 날) null 반환 */
    function day(entry) {
        if (!entry) {
            return null;
        }

        const recover = num(entry.recover);
        const rebate = num(entry.rebate);

        return {
            recover: recover,
            rebate: rebate,
            total: recover + rebate
        };
    }

    /* 전체(또는 uptoKey까지) 누계. uptoKey는 "YYYY-MM-DD" 포함 이하 */
    function totals(entries, uptoKey) {
        let recover = 0;
        let rebate = 0;
        let days = 0;

        Object.keys(entries).forEach(key => {
            if (uptoKey && key > uptoKey) {
                return;
            }

            const result = day(entries[key]);

            if (!result) {
                return;
            }

            recover += result.recover;
            rebate += result.rebate;
            days += 1;
        });

        return {
            recover: recover,
            rebate: rebate,
            total: recover + rebate,
            days: days
        };
    }

    /* 한 달 누계 */
    function month(entries, year, monthIndex) {
        const prefix =
            year + "-" + String(monthIndex + 1).padStart(2, "0");

        let recover = 0;
        let rebate = 0;
        let days = 0;

        Object.keys(entries).forEach(key => {
            if (!key.startsWith(prefix)) {
                return;
            }

            const result = day(entries[key]);

            if (!result) {
                return;
            }

            recover += result.recover;
            rebate += result.rebate;
            days += 1;
        });

        return {
            recover: recover,
            rebate: rebate,
            total: recover + rebate,
            days: days
        };
    }

    /* 복구 진행률 (0~1). recovered에 total(리베이트 포함) 또는
       recover(리베이트 제외)를 넣으면 각각의 진행률이 나온다 */
    function progress(lossAmount, recovered) {
        const target = Math.abs(lossAmount);

        if (target <= 0) {
            return 1;
        }

        return Math.min(1, recovered / target);
    }

    /* 날짜 문자열 도구 */
    function dateKey(date) {
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");

        return date.getFullYear() + "-" + m + "-" + d;
    }

    function parseKey(key) {
        const parts = key.split("-").map(Number);

        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

    function weekdayName(date) {
        return WEEKDAYS[date.getDay()];
    }

    /* 숫자 표시: 1,234.56 형태 (USD — 소수점 2자리 고정) */
    function fmt(n) {
        return Number(n).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    /* 달러 표시: $1,234.56 */
    function usd(n) {
        return "$" + fmt(n);
    }

    /* 남은 손실 표시 문구 + 색상 클래스 */
    function remainingText(remaining) {
        if (remaining > 0) {
            return usd(remaining);
        }

        if (remaining === 0) {
            return "$0.00 · 복구 완료 🎉";
        }

        return "복구 완료 🎉 (+" + usd(-remaining) + ")";
    }

    function remainingClass(remaining) {
        return remaining > 0 ? "negative" : "done";
    }

    return Object.freeze({
        day,
        totals,
        month,
        progress,
        dateKey,
        parseKey,
        weekdayName,
        fmt,
        usd,
        remainingText,
        remainingClass
    });
})();
