// Clase para manejar el carrito de compras
class ShoppingCart {
    constructor() {
        console.log('ShoppingCart - Inicializando...');
        this.items = this.loadCart();
        this.init();
        console.log('ShoppingCart - Inicializado correctamente');
    }

    init() {
        console.log('ShoppingCart - Iniciando configuración...');
        this.updateDisplay();
        this.setupEventListeners();
        console.log('ShoppingCart - Configuración completada');
    }

    loadCart() {
        console.log('ShoppingCart - Cargando carrito desde localStorage...');
        const savedCart = localStorage.getItem('zonoCart');
        const cart = savedCart ? JSON.parse(savedCart) : [];
        console.log('ShoppingCart - Carrito cargado:', cart);
        return cart;
    }

    saveCart() {
        localStorage.setItem('zonoCart', JSON.stringify(this.items));
        this.updateCartCount();
    }

    updateCartCount() {
        const count = this.items.reduce((total, item) => total + item.quantity, 0);
        const cartCountElements = document.querySelectorAll('#cart-count, .mobile-cart-count');
        cartCountElements.forEach(element => {
            element.textContent = count;
        });
    }

    addItem(product) {
        console.log('ShoppingCart - Agregando producto:', product);
        // Asegurarnos de que el precio sea un número entero
        const productToAdd = {
            ...product,
            price: parseInt(product.price)
        };
        
        const existingItem = this.items.find(item => item.id === productToAdd.id);
        if (existingItem) {
            existingItem.quantity += productToAdd.quantity;
            console.log('ShoppingCart - Actualizada cantidad de producto existente');
        } else {
            this.items.push(productToAdd);
            console.log('ShoppingCart - Agregado nuevo producto');
        }
        this.saveCart();
        this.updateDisplay();
        console.log('ShoppingCart - Producto agregado exitosamente');
    }

    removeItem(productId) {
        this.items = this.items.filter(item => item.id !== productId);
        this.saveCart();
        this.updateDisplay();
    }

    updateQuantity(productId, quantity) {
        const item = this.items.find(item => item.id === productId);
        if (item) {
            item.quantity = Math.max(1, quantity);
            this.saveCart();
            this.updateDisplay();
        }
    }

    calculateSubtotal() {
        return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    calculateShipping() {
        return "A convenir";
    }

    calculateTotal() {
        return this.calculateSubtotal();
    }

    formatPrice(price) {
        // Formatear el precio como número entero con separador de miles
        const formattedPrice = new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(price);

        // Asegurarnos de que el símbolo $ tenga un espacio
        return formattedPrice.replace('$', '$ ');
    }

    updateDisplay() {
        console.log('ShoppingCart - Actualizando display...');
        
        // Actualizar el contador del carrito en todas las páginas
        this.updateCartCount();

        // El resto de la actualización solo si estamos en la página del carrito
        const emptyCartMessage = document.getElementById('empty-cart-message');
        const cartItems = document.getElementById('cart-items');
        const cartSummary = document.getElementById('cart-summary');
        const cartSubtotal = document.getElementById('cart-subtotal');
        const cartShipping = document.getElementById('cart-shipping');
        const cartTotal = document.getElementById('cart-total');

        // Si no encontramos los elementos, estamos en otra página
        if (!cartItems || !emptyCartMessage || !cartSummary) {
            console.log('ShoppingCart - No se encontraron elementos del carrito, probablemente estamos en otra página');
            return;
        }

        if (this.items.length === 0) {
            console.log('ShoppingCart - Carrito vacío, mostrando mensaje');
            emptyCartMessage.classList.remove('hidden');
            cartItems.classList.add('hidden');
            cartSummary.classList.add('hidden');
            return;
        }

        console.log('ShoppingCart - Actualizando items del carrito');
        emptyCartMessage.classList.add('hidden');
        cartItems.classList.remove('hidden');
        cartSummary.classList.remove('hidden');

        // Actualizar items
        cartItems.innerHTML = this.items.map(item => `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 flex items-center space-x-4">
                <img src="${item.image}" alt="${item.name}" class="w-24 h-24 object-contain">
                <div class="flex-1">
                    <h3 class="text-lg font-semibold">${item.name}</h3>
                    <p class="text-gray-600 dark:text-gray-400">${this.formatPrice(item.price)}</p>
                    <div class="flex items-center mt-2">
                        <button class="quantity-btn minus" data-id="${item.id}">-</button>
                        <input type="number" value="${item.quantity}" min="1" class="quantity-input w-16 text-center mx-2" data-id="${item.id}">
                        <button class="quantity-btn plus" data-id="${item.id}">+</button>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-lg font-bold text-blue-600 dark:text-blue-400">${this.formatPrice(item.price * item.quantity)}</p>
                    <button class="remove-item text-red-500 hover:text-red-700 mt-2" data-id="${item.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        // Actualizar resumen
        if (cartSubtotal) cartSubtotal.textContent = this.formatPrice(this.calculateSubtotal());
        if (cartShipping) cartShipping.textContent = this.calculateShipping();
        if (cartTotal) cartTotal.textContent = this.formatPrice(this.calculateSubtotal());
    }

    setupEventListeners() {
        console.log('ShoppingCart - Configurando event listeners...');
        
        // Solo configurar los listeners si estamos en la página del carrito
        const cartItemsContainer = document.getElementById('cart-items');
        const checkoutButton = document.getElementById('checkout-button');

        if (cartItemsContainer) {
            console.log('ShoppingCart - Configurando listeners para items del carrito');
            
            cartItemsContainer.addEventListener('click', (e) => {
                const target = e.target;
                const productId = target.dataset.id;

                if (target.classList.contains('remove-item') || target.closest('.remove-item')) {
                    const itemId = target.dataset.id || target.closest('.remove-item').dataset.id;
                    this.removeItem(itemId);
                } else if (target.classList.contains('quantity-btn')) {
                    const input = target.parentElement.querySelector('.quantity-input');
                    const currentValue = parseInt(input.value);
                    if (target.classList.contains('plus')) {
                        input.value = currentValue + 1;
                    } else if (target.classList.contains('minus') && currentValue > 1) {
                        input.value = currentValue - 1;
                    }
                    this.updateQuantity(productId, parseInt(input.value));
                }
            });

            cartItemsContainer.addEventListener('change', (e) => {
                if (e.target.classList.contains('quantity-input')) {
                    const productId = e.target.dataset.id;
                    const quantity = parseInt(e.target.value);
                    if (quantity > 0) {
                        this.updateQuantity(productId, quantity);
                    } else {
                        e.target.value = 1;
                        this.updateQuantity(productId, 1);
                    }
                }
            });
        }

        if (checkoutButton) {
            console.log('ShoppingCart - Configurando listener para botón de checkout');
            
            checkoutButton.addEventListener('click', () => {
                const items = this.items.map(item => `${item.quantity}x ${item.name}`).join('\n');
                const total = this.formatPrice(this.calculateTotal());
                const message = `Hola! Me gustaría realizar el siguiente pedido:\n\n${items}\n\nTotal: ${total}`;
                
                if (typeof window.zonoConfig !== 'undefined') {
                    window.location.href = window.zonoConfig.getWhatsAppUrl(message);
                }
            });
        }

        console.log('ShoppingCart - Event listeners configurados');
    }
}

// Inicializar el carrito cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('Cart.js - DOM cargado, inicializando carrito...');
    window.cart = new ShoppingCart();
    console.log('Cart.js - Carrito inicializado y disponible globalmente');
}); 