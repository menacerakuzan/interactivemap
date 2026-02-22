import Lenis from 'lenis';

export function initLenis() {
    const lenis = new Lenis({
        duration: 1.4,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Expo ease-out
        smooth: true,
        mouseMultiplier: 0.8,
        touchMultiplier: 1.5,
    });

    function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);
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
                y: 40,
                opacity: 0,
                filter: 'blur(4px)',
                duration: 0.9,
                ease: 'power3.out',
                stagger: 0.12,
                delay: 0.3,
                onComplete: () => {
                    gsap.set('.reveal', { clearProps: 'filter' });
                }
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
                y: 50,
                opacity: 0,
                duration: 1.2,
                stagger: 0.1,
                ease: 'power4.out',
                delay: 0.2,
                clipPath: 'inset(100% 0 0 0)'
            });
        }
    }

    // 3D Card Tilt
    document.querySelectorAll('.card-3d').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            card.style.transform = `perspective(800px) rotateX(${y * -4}deg) rotateY(${x * 4}deg) translateY(-4px)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(800px) rotateX(0) rotateY(0) translateY(0)';
            card.style.transition = 'transform 400ms cubic-bezier(0.23, 1, 0.32, 1)';
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
