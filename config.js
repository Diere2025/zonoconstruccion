// config.js - Archivo de configuración centralizado

const config = {
    // --- Datos de Contacto ---
    whatsappNumber: "5491157694181", // Nuevo número de WhatsApp
    email: "comercial@zono.com.ar",

    // --- Redes Sociales ---
    facebookUrl: "https://facebook.com/zonoconstruccion",
    instagramUrl: "https://www.instagram.com/zonoconstruccion",

    // --- Textos predefinidos para WhatsApp (Opcional) ---
    // Puedes personalizar los mensajes que se abren
    whatsappGeneralQueryText: "Hola! Te contacto desde la página web de Zono Construcción y Hogar. Quisiera hacer una consulta.",
    whatsappProductQueryBaseText: "Hola! Me interesa el producto: ",
    whatsappHelpText: "Hola! Te contacto desde la página web de Zono. Necesito ayuda.",
    whatsappCatalogHelpText: "Hola! Estoy viendo el catálogo en la página web de Zono. Necesito ayuda.",
    whatsappCategoriesHelpText: "Hola! Estoy viendo las categorías en la página web de Zono. Necesito ayuda.",

    // --- Función para generar URL de WhatsApp ---
    // Recibe el número y un texto opcional
    getWhatsAppUrl: function(text = this.whatsappGeneralQueryText) {
        // Codifica el texto para que sea seguro en una URL
        const encodedText = encodeURIComponent(text);
        return `https://wa.me/${this.whatsappNumber}?text=${encodedText}`;
    }
};

// Hacemos que 'config' esté disponible globalmente (forma simple para este caso)
window.zonoConfig = config;

	