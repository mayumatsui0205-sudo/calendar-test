// theme.js (shared) - apply body class by local time
(function () {
    function calcThemeByHour(h) {
        if (h >= 5 && h <= 8) return "morning";     // 5:00-8:59
        if (h >= 9 && h <= 15) return "day";        // 9:00-15:59
        if (h >= 16 && h <= 18) return "evening";   // 16:00-18:59
        return "night";                              // 19:00-4:59
    }

    function applyTimeTheme() {
        if (!document.body) return;

        const themes = ["morning", "day", "evening", "night"];
        for (let i = 0; i < themes.length; i++) {
            document.body.classList.remove(themes[i]);
        }
        document.body.classList.add(calcThemeByHour(new Date().getHours()));
    }

    document.addEventListener("DOMContentLoaded", () => {
        applyTimeTheme();
        setInterval(applyTimeTheme, 60 * 1000);
    });
})();

