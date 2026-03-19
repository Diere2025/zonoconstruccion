const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ckvbyfgsbjbfaqotmeld.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrdmJ5ZmdzYmpiZmFxb3RtZWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3OTYwODQsImV4cCI6MjA4OTM3MjA4NH0.G3UdgjMi9lzCYFxhlv0O-9CASU11apkTzkKFAmCOCPw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkProducts() {
  const { data, error } = await supabase.from('products').select('*').limit(5);
  if (error) {
    console.error('Error fetching products:', error);
  } else {
    console.log('Sample products:', JSON.stringify(data, null, 2));
  }
}

checkProducts();
