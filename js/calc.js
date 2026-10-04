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

        const positions = Array.isArray(entry.positions)
            ? entry.positions
            : [];

        const legacyCents = Math.round(num(entry.recover) * 100);
        const positionCents = positions.reduce(
            (sum, position) =>
                sum + Math.round(num(position.pnl) * 100),
            0
        );
        const rebateCents = Math.round(num(entry.rebate) * 100);

        return {
            recover: (legacyCents + positionCents) / 100,
            rebate: rebateCents / 100,
            total: (legacyCents + positionCents + rebateCents) / 100,
            positionTotal: positionCents / 100,
            trades: positions.length
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

        return Math.max(0, Math.min(1, recovered / target));
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

    /* 약수 목록 (오름차순). 220 → [1,2,4,5,10,11,20,22,44,55,110,220] */
    function divisors(n) {
        const small = [];
        const large = [];

        for (let i = 1; i * i <= n; i++) {
            if (n % i === 0) {
                small.push(i);

                if (i * i !== n) {
                    large.unshift(n / i);
                }
            }
        }

        return small.concat(large);
    }

    /* 복구 시나리오 목표 후보들

       남은 손실이 $225.73처럼 소수거나, 226처럼 약수가 적은
       수면 현실적인 계획이 안 나온다. 그래서
         1) 반올림한 정수를 첫 후보로 두고
         2) 주변(±5% 또는 ±30)에서 약수가 많은 정수들을
            찾아 추가 후보로 제시한다.
       새로고침할 때마다 다음 후보를 보여주는 방식으로 쓴다 */
    function scenarioTargets(remaining) {
        const base = Math.max(1, Math.round(remaining));
        const span = Math.max(30, Math.round(base * 0.05));

        const scored = [];

        for (
            let n = Math.max(1, base - span);
            n <= base + span;
            n++
        ) {
            const count = divisors(n)
                .filter(d => d <= 365 && n / d >= 1)
                .length;

            scored.push({ n: n, count: count });
        }

        /* 기본 목표를 제외하고 약수 많은 순 + 가까운 순 */
        const rest = scored
            .filter(s => s.n !== base)
            .sort((a, b) =>
                b.count - a.count ||
                Math.abs(a.n - base) - Math.abs(b.n - base)
            );

        return [base].concat(rest.slice(0, 9).map(s => s.n));
    }

    /* 목표 금액의 약수 조합 전부 (기간 오름차순)

       "매일 $X × N일" — X·N은 항상 정수다 */
    function scenarioPlans(target) {
        return divisors(target)
            .filter(d => d <= 365 && target / d >= 1)
            .map(d => ({ days: d, daily: target / d }))
            .sort((a, b) => a.days - b.days);
    }

    return Object.freeze({
        day,
        totals,
        month,
        progress,
        divisors,
        scenarioTargets,
        scenarioPlans,
        dateKey,
        parseKey,
        weekdayName,
        fmt,
        usd,
        remainingText,
        remainingClass
    });
})();