const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length > 0) {
    envVars[key.trim()] = vals.join('=').trim();
  }
});

const url = envVars.NEXT_PUBLIC_SUPABASE_URL;
const key = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function fixCategories() {
  console.log("Searching for Termotanque products...");
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, sku, category');

  if (error) {
    console.error("Error fetching products:", error);
    return;
  }

  const termotanques = products.filter(p => {
    const nameLower = (p.name || "").toLowerCase();
    const skuLower = (p.sku || "").toLowerCase();
    return nameLower.includes('termotanque') || skuLower.includes('termotanque') || skuLower.includes('tue');
  });

  console.log(`Found ${termotanques.length} Termotanque products:`);
  termotanques.forEach(p => {
    console.log(`- [${p.id}] "${p.name}" (SKU: ${p.sku}) | Categoría actual: "${p.category}"`);
  });

  for (const p of termotanques) {
    if (p.category !== 'Termotanques') {
      const { error: updateErr } = await supabase
        .from('products')
        .update({ category: 'Termotanques' })
        .eq('id', p.id);

      if (updateErr) {
        console.error(`Error updating product ${p.id}:`, updateErr.message);
      } else {
        console.log(`✓ Updated "${p.name}" category to "Termotanques"`);
      }
    }
  }
}

fixCategories();
