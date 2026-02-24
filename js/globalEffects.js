import Lenis from 'lenis';

export function initLenis() {
    const lenis = new Lenis({
        duration: 0.9,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Expo ease-out
        smooth: true,
        mouseMultiplier: 1,
        touchMultiplier: 1.1,
        prevent: (node) => {
            if (!node || typeof node.closest !== 'function') return false;
            return Boolean(
                node.closest(
                    '.leaflet-container, .map-view, .map-container, .context-panel, .specialist-panel, .filter-options'
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
    // GSAP Defaults
    if (typeof gsap !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);

        // Parallax
        gsap.to('.parallax-deep', {
            yPercent: 20,
            ease: 'none',
            scrollTrigger: {
                trigger: '.hero',
                start: 'top top',
                end: 'bottom top',
                scrub: true
            }
        });
        gsap.to('.parallax-mid', {
            yPercent: 12,
            ease: 'none',
            scrollTrigger: {
                trigger: '.hero',
                start: 'top top',
                end: 'bottom top',
                scrub: true
            }
        });
        gsap.to('.parallax-front', {
            yPercent: 6,
            ease: 'none',
            scrollTrigger: {
                trigger: '.hero',
                start: 'top top',
                end: 'bottom top',
                scrub: true
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

    // 3D Card Tilt
    document.querySelectorAll('.card-3d').forEach(card => {
        let rafId = null;
        let targetTransform = 'perspective(800px) rotateX(0) rotateY(0) translateY(0)';
        const flush = () => {
            card.style.transform = targetTransform;
            rafId = null;
        };
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            targetTransform = `perspective(800px) rotateX(${y * -3.2}deg) rotateY(${x * 3.2}deg) translateY(-3px)`;
            if (!rafId) rafId = requestAnimationFrame(flush);
        });
        card.addEventListener('mouseleave', () => {
            targetTransform = 'perspective(800px) rotateX(0) rotateY(0) translateY(0)';
            if (!rafId) rafId = requestAnimationFrame(flush);
        });
    });

    // Gradient Lighting Shift
    document.addEventListener('mousemove', (e) => {
        requestAnimationFrame(() => {
            const x = (e.clientX / window.innerWidth) * 100;
            const y = (e.clientY / window.innerHeight) * 100;
            document.documentElement.style.setProperty('--light-x', `${x}%`);
            document.documentElement.style.setProperty('--light-y', `${y}%`);
        });
    });
}
