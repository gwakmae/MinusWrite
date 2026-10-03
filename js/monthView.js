window.MinusBook = window.MinusBook || {};

/* ======================================================
   월별 기록 뷰

   - 1일부터 말일까지 쭉 나열
   - 입력된 날: 복구 / 리베이트 표시,
     오른쪽에는 그 날까지의 누적 남은 손실(리베이트 포함)
   - 빈 날: "미입력" — 탭하면 그 날짜 입력폼으로 이동
   - 상단에 이 달 요약 + 전체 복구 현황 패널
   ====================================================== */

MinusBook.MonthView = (() => {
    const Calc = MinusBook.Calc;
    const Data = MinusBook.Data;

    /* 보고 있는 연·월 */
    let viewYear = new Date().getFullYear();
    let viewMonth = new Date().getMonth();

    function setMonth(year, month) {
        viewYear = year;
        viewMonth = month;
    }

    function moveMonth(offset) {
        const d = new Date(viewYear, viewMonth + offset, 1);

        viewYear = d.getFullYear();
        viewMonth = d.getMonth();
    }

    /* ==================================================
       렌더링
       ================================================== */

    function render(container) {
        const state = Data.getState();
        const loss = Data.getLossAmount();

        const monthTotal = Calc.month(
            state.entries, viewYear, viewMonth
        );

        const lastDay = new Date(viewYear, viewMonth + 1, 0)
            .getDate();

        const todayKey = Calc.dateKey(new Date());

        const prefix =
            viewYear + "-" + String(viewMonth + 1).padStart(2, "0");

        /* 이 달 시작 전까지의 누계 ("-00" 꼼수로 그 달 1일 직전까지) */
        const before = Calc.totals(state.entries, prefix + "-00");

        let runTotal = before.total;

        let rows = "";

        for (let d = 1; d <= lastDay; d++) {
            const date = new Date(viewYear, viewMonth, d);
            const key = Calc.dateKey(date);
            const entry = state.entries[key];
            const result = Calc.day(entry);

            const weekday = Calc.weekdayName(date);
            const dayOfWeek = date.getDay();
            const wClass =
                dayOfWeek === 0
                    ? "sun"
                    : dayOfWeek === 6
                        ? "sat"
                        : "";

            const rowClass =
                "day-row" +
                (key === todayKey ? " today" : "") +
                (!result ? " empty" : "");

            let incomeCell;
            let netCell;

            if (result) {
                runTotal += result.total;

                const remaining = loss - runTotal;

                incomeCell = daySummary(entry, result);

                netCell =
                    '<span class="net-cell ' +
                    Calc.remainingClass(remaining) + '">' +
                    (remaining > 0
                        ? "-" + Calc.usd(remaining)
                        : "완료 🎉") +
                    '</span>';
            } else {
                incomeCell = "아직 기록이 없습니다";

                netCell =
                    '<span class="net-cell missing">+ 입력</span>';
            }

            rows +=
                '<div class="' + rowClass + '" data-date="' + key + '">' +
                    '<div class="date-cell">' +
                        '<span class="d">' + d + "일</span>" +
                        '<span class="w ' + wClass + '">' +
                            weekday +
                        '</span>' +
                    '</div>' +
                    '<div class="income-cell">' + incomeCell + '</div>' +
                    netCell +
                '</div>';
        }

        container.innerHTML =
            '<section class="panel">' +
                '<div class="month-nav">' +
                    '<button type="button" class="day-nav-btn" ' +
                        'id="prev-month" aria-label="이전 달">◀</button>' +
                    '<div class="month-title">' +
                        viewYear + "년 " + (viewMonth + 1) + "월" +
                    '</div>' +
                    '<button type="button" class="day-nav-btn" ' +
                        'id="next-month" aria-label="다음 달">▶</button>' +
                '</div>' +

                '<div class="summary-grid">' +
                    '<div class="summary-card income">' +
                        '<span class="label">이 달 순수 복구</span>' +
                        '<span class="amount">' +
                            Calc.usd(monthTotal.recover) +
                        '</span>' +
                    '</div>' +
                    '<div class="summary-card rebate">' +
                        '<span class="label">이 달 리베이트</span>' +
                        '<span class="amount">' +
                            Calc.usd(monthTotal.rebate) +
                        '</span>' +
                    '</div>' +
                    '<div class="summary-card net">' +
                        '<span class="label">' +
                            (viewMonth + 1) + "월 총 복구액 (기록 " +
                            monthTotal.days + "일)" +
                        '</span>' +
                        '<span class="amount">' +
                            Calc.usd(monthTotal.total) +
                        '</span>' +
                    '</div>' +
                '</div>' +
            '</section>' +

            /* 전체 복구 현황 (리베이트 제외 / 포함 기준) */
            MinusBook.App.statusHtml() +

            '<section class="panel">' +
                '<h2 class="panel-title">일별 기록</h2>' +
                '<div class="day-list">' + rows + '</div>' +
            '</section>';

        bindEvents(container);
    }

    /* "복구 50,000 · 리베이트 12,000" 요약 */
    function daySummary(entry, result) {
        const parts = [];

        if (result.recover) {
            parts.push("복구 " + Calc.fmt(result.recover));
        }

        if (result.rebate) {
            parts.push("리베이트 " + Calc.fmt(result.rebate));
        }

        if (entry.note) {
            parts.push("📝 " + entry.note);
        }

        return '<span class="nums">' + parts.join(" · ") + '</span>';
    }

    /* ==================================================
       이벤트
       ================================================== */

    function bindEvents(container) {
        container
            .querySelector("#prev-month")
            .addEventListener("click", () => {
                moveMonth(-1);
                render(container);
            });

        container
            .querySelector("#next-month")
            .addEventListener("click", () => {
                moveMonth(1);
                render(container);
            });

        container
            .querySelectorAll("[data-date]")
            .forEach(row => {
                row.addEventListener("click", () => {
                    const date = Calc.parseKey(row.dataset.date);

                    MinusBook.DayView.setDate(date);
                    MinusBook.App.showView("day");
                });
            });
    }

    return Object.freeze({ render, setMonth });
})();