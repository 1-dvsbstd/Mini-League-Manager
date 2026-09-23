(function () {
    let pending = false;
    function updateEdges(element) {
        element.classList.toggle('has-more-above', element.scrollTop > 2);
        element.classList.toggle('has-more-below', element.scrollTop + element.clientHeight < element.scrollHeight - 2);
    }
    function destination() {
        const sections = [...document.querySelectorAll('[data-jump-section]')];
        return sections.find(section => section.getBoundingClientRect().top > Math.max(40, innerHeight / 2)) || sections[0];
    }
    function refresh() {
        document.querySelectorAll('.is-scrollable').forEach(updateEdges);
        const button = document.getElementById('next-section');
        const next = destination();
        if (!button) return;
        button.hidden = !next;
        if (next) {
            const label = 'Jump to ' + next.dataset.jumpSection;
            button.setAttribute('aria-label', label);
            button.title = label;
            button.classList.toggle('return-to-top', next.getBoundingClientRect().top <= 40);
        }
    }
    function captureScroll() {
        return new Map([...document.querySelectorAll('[data-scroll-key]')]
            .filter(element => !element.closest('[aria-hidden="true"]'))
            .map(element => [element.dataset.scrollKey, element.scrollTop]));
    }
    function restoreScroll(positions) {
        if (!positions) return;
        document.querySelectorAll('[data-scroll-key]').forEach(element => {
            if (positions.has(element.dataset.scrollKey)) element.scrollTop = positions.get(element.dataset.scrollKey);
        });
    }
    window.MemberNavigation = { refresh, captureScroll, restoreScroll };
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
    window.addEventListener('resize', refresh);
    document.addEventListener('scroll', event => {
        if (event.target.classList?.contains('is-scrollable')) updateEdges(event.target);
    }, { capture: true, passive: true });
})();
