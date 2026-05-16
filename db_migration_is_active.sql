-- Agrega la columna is_active por defecto en verdadero (visible)
ALTER TABLE products ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

-- Opcional: Asegurarnos de que los productos actuales "internos" sin imagen
-- arranquen desactivados si querés que el comportamiento se mantenga desde el día 1
UPDATE products SET is_active = FALSE WHERE image_url = '' OR image_url IS NULL OR name ILIKE '%[Interno]%';
