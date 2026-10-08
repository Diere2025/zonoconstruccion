export function inheritVariantPrices<T extends {id:string;parent_id?:string|null;variant_type?:string|null;price:number}>(products:T[]):T[]{
 const byId=new Map(products.map(product=>[product.id,product]));
 return products.map(product=>{
   if(!product.parent_id)return product;
   // Blind tank variants share the standard tank price. Other presentations keep their own price.
   if(Number(product.price)!==0&&(product.variant_type||'').toLowerCase()!=='ciego')return product;
   const parent=byId.get(product.parent_id);return parent?{...product,price:parent.price}:product;
 });
}
