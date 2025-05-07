// Funcionalidad del menú móvil
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenuClose = document.getElementById('mobile-menu-close');
    const mobileMenuContent = document.querySelector('.mobile-menu-content');

    // Función para abrir el menú
    function openMenu() {
        mobileMenu.classList.add('active');
        document.body.style.overflow = 'hidden'; // Previene el scroll del body
    }

    // Función para cerrar el menú
    function closeMenu() {
        mobileMenu.classList.remove('active');
        document.body.style.overflow = ''; // Restaura el scroll del body
    }

    // Event listeners para abrir/cerrar el menú
    mobileMenuButton.addEventListener('click', openMenu);
    mobileMenuClose.addEventListener('click', closeMenu);

    // Cerrar el menú al hacer clic fuera del contenido
    mobileMenu.addEventListener('click', function(e) {
        if (e.target === mobileMenu) {
            closeMenu();
        }
    });

    // Cerrar el menú al hacer clic en un enlace
    const menuLinks = document.querySelectorAll('.mobile-menu-item');
    menuLinks.forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    // Actualizar el enlace de WhatsApp con el número correcto
    const mobileWhatsappLink = document.getElementById('mobile-whatsapp-link');
    if (mobileWhatsappLink && typeof window.zonoConfig !== 'undefined') {
        mobileWhatsappLink.href = window.zonoConfig.getWhatsAppUrl(window.zonoConfig.whatsappGeneralQueryText);
    }

    // Marcar el enlace activo en el menú móvil
    function setActiveMenuItem() {
        const currentPath = window.location.pathname;
        const currentHash = window.location.hash;
        
        menuLinks.forEach(link => {
            const linkPath = link.getAttribute('href');
            if (currentPath === '/' || currentPath.endsWith('index.html')) {
                // En la página de inicio
                if (linkPath === 'index.html#inicio' || linkPath === '#inicio') {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            } else {
                // En otras páginas
                if (linkPath === currentPath) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            }
        });
    }

    // Actualizar enlace activo al cambiar el hash
    window.addEventListener('hashchange', setActiveMenuItem);
    setActiveMenuItem(); // Establecer enlace activo inicial
}); 