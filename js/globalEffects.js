import Lenis from 'lenis';

export function initLenis() {
    const lenis = new Lenis({
        duration: 0.72,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Expo ease-out
        smooth: true,
        smoothTouch: false,
        mouseMultiplier: 1,
        touchMultiplier: 1,
        prevent: (node) => {
            if (!node || typeof node.closest !== 'function') return false;
            return Boolean(
                node.closest(
                    '.mapboxgl-map, .map-view, .map-container, .context-panel, .specialist-panel, .filter-options'
                )
            );
        },
    });

    function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);
    return lenis;
}

export function initInteractions() {
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const isCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;

    // GSAP Defaults
    if (typeof gsap !== 'undefined' && !prefersReducedMotion) {
        gsap.registerPlugin(ScrollTrigger);

        // Parallax
        gsap.to('.parallax-deep', {
            yPercent: 12,
            ease: 'none',
            scrollTrigger: {
                trigger: '.hero',
                start: 'top top',
                end: 'bottom top',
                scrub: 0.25
            }
        });
        gsap.to('.parallax-mid', {
            yPercent: 8,
            ease: 'none',
            scrollTrigger: {
                trigger: '.hero',
                start: 'top top',
                end: 'bottom top',
                scrub: 0.25
            }
        });
        gsap.to('.parallax-front', {
            yPercent: 4,
            ease: 'none',
            scrollTrigger: {
                trigger: '.hero',
                start: 'top top',
                end: 'bottom top',
                scrub: 0.25
            }
        });

        // Reveal animations - play on load
        const reveals = document.querySelectorAll('.reveal');
        if (reveals.length > 0) {
            gsap.from('.reveal', {
                y: 26,
                opacity: 0,
                duration: 0.55,
                ease: 'power3.out',
                stagger: 0.07,
                delay: 0.12
            });
        }

        // Word by word mask reveal
        const title = document.getElementById('hero-title');
        if (title) {
            const text = title.innerText;
            title.innerHTML = '';
            text.split(' ').forEach((word, index, arr) => {
                const span = document.createElement('span');
                // Use innerHTML and explicitly add &nbsp; except for the last word
                span.innerHTML = word + (index < arr.length - 1 ? '&nbsp;' : '');
                span.style.display = 'inline-block';
                title.appendChild(span);
            });

            gsap.from('#hero-title span', {
                y: 32,
                opacity: 0,
                duration: 0.75,
                stagger: 0.07,
                ease: 'power4.out',
                delay: 0.1,
                clipPath: 'inset(100% 0 0 0)'
            });
        }
    }

    // Keep card interactions stable; avoid hover jitter from JS tilt.

    // Gradient Lighting Shift
    if (!prefersReducedMotion && !isCoarsePointer) {
        let lightRaf = 0;
        let pendingX = 50;
        let pendingY = 30;
        const updateLight = () => {
            lightRaf = 0;
            const heroVisible = document.querySelector('.hero')?.style?.display !== 'none';
            if (!heroVisible) return;
            document.documentElement.style.setProperty('--light-x', `${pendingX}%`);
            document.documentElement.style.setProperty('--light-y', `${pendingY}%`);
        };
        document.addEventListener('mousemove', (e) => {
            const target = e.target;
            if (target && typeof target.closest === 'function' && target.closest('.map-container, .map-view, #mapbox-map')) {
                return;
            }
            pendingX = (e.clientX / window.innerWidth) * 100;
            pendingY = (e.clientY / window.innerHeight) * 100;
            if (!lightRaf) lightRaf = requestAnimationFrame(updateLight);
        }, { passive: true });
    }
}
