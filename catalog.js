document.addEventListener('DOMContentLoaded', () => {
    console.log('Catalog.js - Iniciando configuración...');
    
    // Esperar a que el carrito esté disponible
    const waitForCart = setInterval(() => {
        if (window.cart) {
            clearInterval(waitForCart);
            setupCatalogHandlers();
        }
    }, 100);

    function setupCatalogHandlers() {
        console.log('Catalog.js - Configurando manejadores...');
        
        // Manejar clics en los botones "Agregar al Carrito"
        document.querySelectorAll('.add-to-cart').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Catalog.js - Botón de agregar al carrito clickeado');
                
                const productCard = button.closest('.product-card');
                if (!productCard) {
                    console.error('Catalog.js - No se encontró la tarjeta del producto');
                    return;
                }

                // Obtener la cantidad
                const quantityInput = productCard.querySelector('input[type="number"]');
                const quantity = parseInt(quantityInput?.value) || 1;
                console.log('Catalog.js - Cantidad seleccionada:', quantity);
                
                // Obtener el precio (corregido el selector)
                const priceElement = productCard.querySelector('.text-red-600');
                if (!priceElement) {
                    console.error('Catalog.js - No se encontró el elemento del precio');
                    return;
                }
                const priceText = priceElement.textContent;
                const price = parseFloat(priceText.replace(/[^0-9.-]+/g, ''));
                console.log('Catalog.js - Precio extraído:', price);
                
                const product = {
                    id: productCard.dataset.productId || Math.random().toString(36).substr(2, 9),
                    name: productCard.querySelector('h3').textContent,
                    price: price,
                    image: productCard.querySelector('img').src,
                    quantity: quantity
                };
                console.log('Catalog.js - Producto a agregar:', product);

                // Agregar al carrito
                window.cart.addItem(product);
                
                // Mostrar mensaje de éxito
                const toast = document.createElement('div');
                toast.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
                toast.textContent = '¡Producto agregado al carrito!';
                document.body.appendChild(toast);
                
                setTimeout(() => {
                    toast.remove();
                }, 3000);
            });
        });

        // Manejar clics en los botones de WhatsApp
        document.querySelectorAll('.whatsapp-button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const productInfo = button.dataset.producto;
                if (typeof window.zonoConfig !== 'undefined') {
                    const message = `Hola! Me interesa el siguiente producto:\n\n${productInfo}\n\n¿Podrían darme más información?`;
                    window.location.href = window.zonoConfig.getWhatsAppUrl(message);
                }
            });
        });
    }

    console.log('Catalog.js - Script cargado completamente');
}); 