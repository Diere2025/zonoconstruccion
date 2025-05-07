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
    if (mobileWhatsappLink) {
        const whatsappNumber = '+5491112345678'; // Reemplazar con el número real
        const whatsappMessage = 'Hola! Quisiera hacer una consulta sobre sus productos.';
        mobileWhatsappLink.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;
    }

    // Marcar el enlace activo en el menú móvil
    function setActiveMenuItem() {
        const currentHash = window.location.hash || '#inicio';
        menuLinks.forEach(link => {
            if (link.getAttribute('href') === currentHash) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    // Actualizar enlace activo al cambiar el hash
    window.addEventListener('hashchange', setActiveMenuItem);
    setActiveMenuItem(); // Establecer enlace activo inicial
}); 