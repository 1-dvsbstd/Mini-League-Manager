(function () {
    let pending = false;
    function destination() {
        const sections = [...document.querySelectorAll('[data-jump-section]')];
        return sections.find(section => section.getBoundingClientRect().top > Math.max(40, innerHeight / 2)) || sections[0];
    }
    function refresh() {
        const button = document.getElementById('next-section');
        const next = destination();
        if (!button) return;
        button.hidden = !next;
        if (next) {
            const label = 'Jump to ' + next.dataset.jumpSection;
            button.setAttribute('aria-label', label);
            button.title = label;
        }
    }
    window.MemberNavigation = { refresh };
    window.addEventListener('DOMContentLoaded', () => {
        document.getElementById('next-section').addEventListener('click', () => {
            const next = destination();
            if (!next) return;
            next.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
            next.setAttribute('tabindex', '-1');
            next.focus({ preventScroll: true });
        });
        refresh();
    });
    window.addEventListener('scroll', () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; refresh(); });
    }, { passive: true });
})();
