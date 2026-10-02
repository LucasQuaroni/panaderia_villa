'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { readJsonSetting, writeJsonSetting } from '@/lib/json-settings'
import { roundUpTo100 } from '@/lib/money'
import { useScale, EMPTY_KG } from '@/hooks/use-scale'
import { updateCartAt, type CartIndex } from '@/lib/pos/cart-pair'
import { cartDraftKey, readCartDraft, saveCartDraft } from '@/lib/pos/cart-drafts'
import WholesaleLedger from './WholesaleLedger'
import { AlertTriangle, Cable, CheckCircle2, Minus, Plus, Printer, Save, Scale, Search, ShoppingCart, Trash2, Users, X } from 'lucide-react'

interface Customer { id:string; business_name:string; contact_name:string; tax_id:string; phone:string; address:string; has_current_account:boolean; active:boolean }
interface Product { id:string; name:string; unit:string; price:number|null; active:boolean; show_on_pos?:boolean }
interface CartItem { product:Product; quantity:number; unitPrice:number; draft:string }
interface RecipeItem { quantity:number; raw_material?:{ unit_price:number } }
interface Recipe { product_id:string; yield_qty:number; items:RecipeItem[] }
interface PriceSetting { markup_pct:number|null; price:number }
type Method='Efectivo'|'Transferencia'|'Cuenta corriente'|'Pago parcial'; type Cart={items:CartItem[];customerId:string;paymentMethod:Method;paidAmount?:string;paidMethod?:'Efectivo'|'Transferencia'}; type Tab='sale'|'customers'|'prices'; type Role='admin'|'cashier'|null
const blank=():Cart=>({items:[],customerId:'',paymentMethod:'Efectivo'}); const PRICES_KEY='wholesale_prices_v1'
const fmt=(v:number)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(v)
const cls='w-full px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white'; const parse=(s:string)=>Number(s.replace(',','.')); const line=(x:CartItem)=>roundUpTo100(x.quantity*x.unitPrice)

export default function WholesalePage(){
 const supabase=createClient(),scale=useScale(); const [role,setRole]=useState<Role>(null),[tab,setTab]=useState<Tab>('sale'),[customers,setCustomers]=useState<Customer[]>([]),[products,setProducts]=useState<Product[]>([]),[recipes,setRecipes]=useState<Recipe[]>([]),[prices,setPrices]=useState<Record<string,PriceSetting>>({}),[accountSales,setAccountSales]=useState<Record<string,number>>({}),[accountPayments,setAccountPayments]=useState<Record<string,number>>({}),[sessionId,setSessionId]=useState<string|null>(null),[carts,setCarts]=useState<[Cart,Cart]>([blank(),blank()]),[active,setActive]=useState<0|1>(0),[search,setSearch]=useState(''),[letter,setLetter]=useState<string|null>(null),[customerSearch,setCustomerSearch]=useState(''),[weighing,setWeighing]=useState<Product|null>(null),[modal,setModal]=useState<Customer|'new'|null>(null),[paymentCustomer,setPaymentCustomer]=useState<Customer|null>(null),[ledgerCustomer,setLedgerCustomer]=useState<Customer|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[markupDrafts,setMarkupDrafts]=useState<Record<string,string>>({}),[priceDrafts,setPriceDrafts]=useState<Record<string,string>>({}),[lastTransfer,setLastTransfer]=useState<{id:string;customer:string;total:number;items:CartItem[]}|null>(null)
 const weighingCartRef=useRef<CartIndex>(0)
 const saleAttempt=useRef<{payload:string;id:string}|null>(null)
 const saleLock=useRef(false)
 const draftOwnerRef=useRef<string|null>(null)
 const [draftOwner,setDraftOwner]=useState<string|null>(null)
 const load=useCallback(async()=>{
  setLoading(true);setError('')
  const {data:{user}}=await supabase.auth.getUser()
  const {data:roleRow}=user?await supabase.from('user_roles').select('role').eq('user_id',user.id).maybeSingle():{data:null}
  const nextRole=(roleRow?.role as Role)??null
  const [customersResult,productsResult,openResult,storedPrices]=await Promise.all([
   supabase.from('wholesale_customers').select('*').order('business_name'),
   supabase.from('products').select('id,name,unit,price,active,show_on_pos').eq('active',true).order('name'),
   supabase.from('cash_sessions').select('id').eq('status','open').order('opened_at',{ascending:false}).limit(1).maybeSingle(),
   readJsonSetting<Record<string,PriceSetting>>(supabase,PRICES_KEY,{}),
  ])
  const nextProducts=((productsResult.data??[])as Product[]).map(product=>({...product,price:product.price==null?null:Number(product.price)}))
  if(user&&draftOwnerRef.current!==user.id){
   const draft=readCartDraft<Cart>(cartDraftKey('mayorista',user.id))
   if(draft&&draft.carts.every(c=>c&&Array.isArray(c.items)&&typeof c.customerId==='string')){
    const restored=draft.carts.map(c=>({...c,items:c.items.flatMap(item=>{
     const product=nextProducts.find(p=>p.id===item.product?.id)
     return product&&Number.isFinite(item.quantity)&&Number.isFinite(item.unitPrice)?[{...item,product}]:[]
    })}))as[Cart,Cart]
    setCarts(restored);setActive(draft.active)
   }
   draftOwnerRef.current=user.id;setDraftOwner(user.id)
  }
  if(customersResult.error||productsResult.error) setError(customersResult.error?.message??productsResult.error?.message??'No se pudo cargar el mostrador.')
  setRole(nextRole);setCustomers((customersResult.data??[])as Customer[]);setProducts(nextProducts);setPrices(storedPrices);setSessionId(openResult.data?.id??null)
  setMarkupDrafts(Object.fromEntries(nextProducts.map(product=>[product.id,storedPrices[product.id]?.markup_pct==null?'':String(storedPrices[product.id].markup_pct)])))
  setPriceDrafts(Object.fromEntries(nextProducts.map(product=>[product.id,String(storedPrices[product.id]?.price??product.price??0)])))
  if(nextRole==='admin'||nextRole==='cashier'){
   const [{data:recipeRows},{data:balanceRows,error:balanceError}]=await Promise.all([
    nextRole==='admin'?supabase.from('recipes').select('product_id,yield_qty,items:recipe_items(quantity,raw_material:raw_materials(unit_price))'):Promise.resolve({data:[]}),
    supabase.from('wholesale_account_balances').select('id,account_sales,account_payments'),
   ])
   if(balanceError)setError(balanceError.message)
   setRecipes((recipeRows??[])as unknown as Recipe[])
   const salesTotals:Record<string,number>={};const paymentTotals:Record<string,number>={}
   for(const row of balanceRows??[]){salesTotals[row.id]=Number(row.account_sales);paymentTotals[row.id]=Number(row.account_payments)}
   setAccountSales(salesTotals);setAccountPayments(paymentTotals)
  }else{setRecipes([]);setAccountSales({});setAccountPayments({});setTab('sale')}
  setLoading(false)
 },[supabase]); useEffect(()=>{void load()},[load])
 useEffect(()=>{if(draftOwner)saveCartDraft(cartDraftKey('mayorista',draftOwner),carts,active)},[draftOwner,carts,active])
 const cart=carts[active]
 const selected=customers.find(customer=>customer.id===cart.customerId)
 const price=useCallback((product:Product)=>roundUpTo100(Number(prices[product.id]?.price??product.price??0)),[prices])
 const total=cart.items.reduce((sum,item)=>sum+line(item),0)
 const norm=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 const listed=useMemo(()=>products.filter(product=>product.show_on_pos!==false&&norm(product.name).includes(norm(search))&&(!letter||norm(product.name).startsWith(norm(letter)))&&price(product)>0),[products,search,letter,price])
 const letters=useMemo(()=>new Set(products.filter(product=>product.show_on_pos!==false).map(product=>norm(product.name)[0]?.toUpperCase())),[products])
 const clientList=useMemo(()=>customers.filter(customer=>norm(`${customer.business_name} ${customer.contact_name} ${customer.tax_id} ${customer.phone}`).includes(norm(customerSearch))),[customers,customerSearch])
 const editAt=(index:CartIndex,fn:(current:Cart)=>Cart)=>setCarts(previous=>updateCartAt(previous,index,fn))
 const edit=(fn:(current:Cart)=>Cart)=>editAt(active,fn)
 const costFor=useCallback((productId:string)=>{const recipe=recipes.find(item=>item.product_id===productId);if(!recipe)return null;const totalCost=(recipe.items??[]).reduce((sum,item)=>sum+Number(item.quantity)*Number(item.raw_material?.unit_price??0),0);return Number(recipe.yield_qty)>0?totalCost/Number(recipe.yield_qty):totalCost},[recipes])
 const draftPrice=(product:Product)=>{const cost=costFor(product.id);if(cost===null)return parse(priceDrafts[product.id]??'')||0;const markup=parse(markupDrafts[product.id]??'0');return roundUpTo100(cost*(1+(Number.isFinite(markup)?markup:0)/100))}
 const balanceFor=(customerId:string)=>(accountSales[customerId]??0)-(accountPayments[customerId]??0)
 const add=(product:Product,quantity=1,target:CartIndex=active)=>editAt(target,current=>{const existing=current.items.find(item=>item.product.id===product.id);if(existing){const next=Math.round((existing.quantity+quantity)*1000)/1000;return {...current,items:current.items.map(item=>item===existing?{...item,quantity:next,draft:String(next).replace('.',',')}:item)}}return {...current,items:[...current.items,{product,quantity,unitPrice:price(product),draft:quantity.toFixed(product.unit==='kg'?3:0).replace('.',',')}]}})
 const startWeighing=(product:Product)=>{weighingCartRef.current=active;setWeighing(product)}
 const setDraft=(id:string,draft:string)=>{if(!/^\d*(?:[.,]\d*)?$/.test(draft))return;edit(current=>({...current,items:current.items.map(item=>item.product.id===id?{...item,draft,quantity:Number.isFinite(parse(draft))?parse(draft):item.quantity}:item)}))}
 const remove=(id:string)=>edit(current=>({...current,items:current.items.filter(item=>item.product.id!==id)}))
 const register=async()=>{
  if(saleLock.current)return
  const targetCart=active,target=carts[targetCart],targetCustomer=customers.find(customer=>customer.id===target.customerId)
  if(!targetCustomer||!sessionId||!target.items.length)return
  if(target.items.some(item=>!Number.isFinite(parse(item.draft))||parse(item.draft)<=0)){setMessage('Revisá las cantidades antes de confirmar.');return}
  const soldItems=target.items.map(item=>({...item})),saleTotal=soldItems.reduce((sum,item)=>sum+line(item),0)
  const partial=target.paymentMethod==='Pago parcial',paid=parse(target.paidAmount??'')
  if(partial&&(!Number.isFinite(paid)||paid<=0||paid>=saleTotal||Math.abs(paid*100-Math.round(paid*100))>0.00001)){setMessage('El abono debe ser mayor que cero, menor al total y tener hasta dos decimales.');return}
  const items=soldItems.map(item=>({product_id:item.product.id,description:item.product.name,unit:item.product.unit,quantity:item.quantity,stock_quantity:item.quantity,unit_price:item.unitPrice,subtotal:line(item)}))
  const payload=JSON.stringify({sessionId,target,items})
  if(saleAttempt.current?.payload!==payload)saleAttempt.current={payload,id:crypto.randomUUID()}
  saleLock.current=true;setSaving(true)
  try{
   const {data,error}=partial?await supabase.rpc('register_partial_sale',{p_client_uuid:saleAttempt.current.id,p_cash_session_id:sessionId,p_sale_channel:'mayorista',p_customer_id:targetCustomer.id,p_items:items,p_paid_amount:paid,p_paid_method:target.paidMethod??'Efectivo'}):await supabase.rpc('register_wholesale_sale',{p_client_uuid:saleAttempt.current.id,p_cash_session_id:sessionId,p_payment_method:target.paymentMethod,p_customer_id:targetCustomer.id,p_items:items})
   if(error)throw new Error(error.message)
   if(target.paymentMethod==='Transferencia')setLastTransfer({id:String(data),customer:targetCustomer.business_name,total:saleTotal,items:soldItems});else setLastTransfer(null)
   saleAttempt.current=null;editAt(targetCart,()=>blank())
   setMessage(partial?`Abono de ${fmt(paid)} registrado por ${target.paidMethod??'Efectivo'}. Quedan ${fmt(saleTotal-paid)} en cuenta corriente.`:`Venta mayorista registrada (${target.paymentMethod}).`)
   await load()
  }catch(failure){setMessage(`No se pudo confirmar: ${failure instanceof Error?failure.message:'Reintentá.'} El carrito se conserva.`)}finally{saleLock.current=false;setSaving(false)}
 }
 const saveCustomer=async(customer:Customer)=>{const {error}=role==='cashier'?await supabase.from('wholesale_customers').insert(customer):await supabase.from('wholesale_customers').upsert(customer);if(error)return error.message;setModal(null);await load();return null}
 const toggle=async(customer:Customer)=>{const action=customer.active?'dar de baja':'reactivar';if(!window.confirm(`¿Confirmás ${action} a ${customer.business_name}? Se conserva todo el historial.`))return;const {error}=await supabase.from('wholesale_customers').update({active:!customer.active}).eq('id',customer.id);setMessage(error?.message??`Cliente ${customer.active?'dado de baja':'reactivado'}.`);if(!error)await load()}
 const pay=async(customer:Customer,amount:number,method:'Efectivo'|'Transferencia')=>{if(!Number.isFinite(amount)||amount<=0)return 'Ingresá un importe válido.';if(!sessionId)return 'Abrí la caja compartida antes de registrar el cobro.';const {error}=await supabase.rpc('register_wholesale_payment',{p_customer_id:customer.id,p_cash_session_id:sessionId,p_amount:amount,p_payment_method:method});if(error)return error.message;setPaymentCustomer(null);setMessage(`Cobro de cuenta registrado por ${method}.`);await load();return null}
 const savePrice=async(product:Product)=>{const cost=costFor(product.id),rawMarkup=markupDrafts[product.id]??'',markup=rawMarkup===''?null:parse(rawMarkup),rawPrice=cost===null?parse(priceDrafts[product.id]??''):cost*(1+(markup??0)/100);if(!Number.isFinite(rawPrice)||rawPrice<0||(markup!==null&&(!Number.isFinite(markup)||markup<0)))return;const savedPrice=roundUpTo100(rawPrice),next={...prices,[product.id]:{markup_pct:cost===null?null:markup,price:savedPrice}};const error=await writeJsonSetting(supabase,PRICES_KEY,next);if(error)setMessage(`No se pudo guardar el precio mayorista: ${error}`);else{setPrices(next);setPriceDrafts(previous=>({...previous,[product.id]:String(savedPrice)}));setMessage('Precio mayorista guardado.')}}

 useEffect(()=>{const refresh=async()=>{const {data}=await supabase.from('cash_sessions').select('id').eq('status','open').order('opened_at',{ascending:false}).limit(1).maybeSingle();setSessionId(data?.id??null)};const timer=window.setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh)}},[supabase])
 useEffect(()=>{if((cart.paymentMethod==='Cuenta corriente'||cart.paymentMethod==='Pago parcial')&&!selected?.has_current_account){setCarts(previous=>previous.map((current,index)=>index===active?{...current,paymentMethod:'Efectivo'}:current)as[Cart,Cart])}},[active,cart.paymentMethod,selected?.has_current_account])
 if(loading) return <div className="text-center py-20 font-body text-warm-gray">Cargando mostrador mayorista...</div>
 if((tab as Tab)==='sale') return <div className="max-w-6xl mx-auto">
  <div className="mb-6"><h1 className="font-sans text-3xl font-bold text-charcoal">Mostrador mayorista</h1><p className="font-body text-warm-gray mt-1">Dos pedidos simultáneos, clientes y cuenta corriente.</p></div>
  <WholesaleTabs tab={tab} setTab={setTab} role={role}/>
  {error&&<div className="mb-4 px-4 py-3 rounded-xl border bg-red-50 border-red-200 text-red-700 text-sm">{error}</div>}
  {message&&<div className="mb-4 px-4 py-3 rounded-xl border bg-green-50 border-green-200 text-green-800 text-sm">{message}</div>}
  <ScaleBar scale={scale}/>
  <div className="grid lg:grid-cols-[1fr_390px] gap-5 mt-4">
   <div>
    <div className="relative mb-3"><Search size={17} className="absolute left-3 top-3 text-warm-gray"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar producto..." className={`${cls} pl-9`}/></div>
    <div className="flex flex-wrap gap-1 mb-4"><button onClick={()=>setLetter(null)} className={`px-2 h-8 rounded ${!letter?'bg-burgundy text-cream':'bg-white border'}`}>Todos</button>{'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('').map(l=><button key={l} disabled={!letters.has(l)} onClick={()=>setLetter(letter===l?null:l)} className={`w-8 h-8 rounded ${letter===l?'bg-burgundy text-cream':'bg-white border'} disabled:opacity-30`}>{l}</button>)}</div>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{listed.map(p=><button key={p.id} onClick={()=>p.unit==='kg'?startWeighing(p):add(p)} className="text-left bg-white border border-border rounded-2xl p-4 hover:border-burgundy"><div className="font-semibold text-sm">{p.name}</div><div className="font-num text-burgundy font-bold mt-2">{fmt(price(p))} <span className="text-xs text-warm-gray">/ {p.unit}</span></div></button>)}</div>
   </div>
   <div className="flex flex-col gap-4 h-fit lg:sticky lg:top-8">
    {([0,1] as const).map(index=>{
     const panelCart=carts[index]
     const panelCustomer=customers.find(customer=>customer.id===panelCart.customerId)
     const panelTotal=panelCart.items.reduce((sum,item)=>sum+line(item),0)
     const isActive=active===index
     return <section key={index} onClick={()=>{if(!isActive)setActive(index)}} aria-label={`Carrito mayorista ${index+1}${isActive?', seleccionado':', inactivo'}`} className={`rounded-2xl border flex flex-col min-h-[390px] overflow-hidden transition-all duration-200 ${isActive?'bg-white border-burgundy shadow-lg ring-2 ring-burgundy/15':'bg-stone-200/80 border-stone-300 opacity-70 cursor-pointer hover:opacity-90'}`}>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isActive?'bg-burgundy text-cream border-burgundy':'bg-stone-300 text-stone-600 border-stone-400'}`}>
       <div className="flex items-center gap-2 font-body text-sm font-bold"><ShoppingCart size={17}/>Carrito {index+1}<span className={`px-2 py-0.5 rounded-full text-[10px] ${isActive?'bg-cream/20 text-cream':'bg-stone-400/60 text-stone-700'}`}>{panelCart.items.length}</span>{isActive&&<span className="text-[10px] uppercase tracking-wide text-cream/80">Seleccionado</span>}</div>
      </div>
      <div className={`p-3 border-b ${isActive?'border-border':'border-stone-300 pointer-events-none select-none'}`}>
       <div className="relative"><Search size={15} className="absolute left-3 top-3 text-warm-gray"/><input disabled={!isActive} value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Cliente, CUIT o teléfono" className={`${cls} pl-8 disabled:bg-stone-100 disabled:text-stone-500`}/></div>
       <select disabled={!isActive} value={panelCart.customerId} onChange={e=>edit(current=>({...current,customerId:e.target.value}))} className={`${cls} mt-2 disabled:bg-stone-100 disabled:text-stone-500`}><option value="">Seleccionar cliente</option>{clientList.filter(customer=>customer.active).map(customer=><option key={customer.id} value={customer.id}>{customer.business_name}</option>)}</select>
      </div>
      <div className={`flex-1 divide-y overflow-y-auto max-h-[32vh] ${isActive?'divide-border':'divide-stone-300 pointer-events-none select-none'}`}>
       {panelCart.items.length===0?<p className={`p-8 text-center text-sm ${isActive?'text-warm-gray':'text-stone-500'}`}>{isActive?'Elegí productos para este carrito.':`Tocá este recuadro para usar el carrito ${index+1}.`}</p>:panelCart.items.map(item=><div key={item.product.id} className="p-3 flex gap-2 items-center"><div className="flex-1 min-w-0"><div className={`font-semibold text-sm truncate ${isActive?'text-charcoal':'text-stone-600'}`}>{item.product.name}</div><div className={`text-xs ${isActive?'text-warm-gray':'text-stone-500'}`}>{fmt(item.unitPrice)} / {item.product.unit}</div></div><button onClick={()=>setDraft(item.product.id,String(Math.max(0,item.quantity-(item.product.unit==='kg'?.1:1))))} className="p-1 border rounded"><Minus size={13}/></button><input inputMode="decimal" value={item.draft} onChange={e=>setDraft(item.product.id,e.target.value)} className="w-16 p-1 text-center border rounded font-num"/><button onClick={()=>setDraft(item.product.id,String(item.quantity+(item.product.unit==='kg'?.1:1)))} className="p-1 border rounded"><Plus size={13}/></button><button onClick={()=>remove(item.product.id)} className="text-red-500"><Trash2 size={15}/></button></div>)}
      </div>
      <div className={`p-4 border-t ${isActive?'border-border bg-white':'border-stone-300 bg-stone-200/70'}`}>
       <div className="flex justify-between mb-3"><span className={`text-sm ${isActive?'text-warm-gray':'text-stone-500'}`}>Total</span><b className={`font-num text-2xl ${isActive?'text-burgundy':'text-stone-600'}`}>{fmt(panelTotal)}</b></div>
       {isActive?<><select value={panelCart.paymentMethod} onChange={e=>edit(current=>({...current,paymentMethod:e.target.value as Method}))} className={`${cls} mb-3`}><option>Efectivo</option><option>Transferencia</option>{panelCustomer?.has_current_account&&<><option>Cuenta corriente</option><option>Pago parcial</option></>}</select>{panelCart.paymentMethod==='Pago parcial'&&<div className="mb-3 space-y-2"><input aria-label="Abono inicial" inputMode="decimal" value={panelCart.paidAmount??''} onChange={e=>edit(current=>({...current,paidAmount:e.target.value}))} placeholder="Importe que paga ahora" className={cls}/><select aria-label="Medio del abono" value={panelCart.paidMethod??'Efectivo'} onChange={e=>edit(current=>({...current,paidMethod:e.target.value as 'Efectivo'|'Transferencia'}))} className={cls}><option>Efectivo</option><option>Transferencia</option></select><p className="text-xs text-warm-gray">Queda a cuenta: {fmt(Math.max(0,panelTotal-(parse(panelCart.paidAmount??'')||0)))}</p>{panelCart.paidMethod==='Transferencia'&&<p className="text-xs text-warm-gray">Confirmá cuando recibas la transferencia.</p>}</div>}{!sessionId&&<p className="text-xs text-red-600 mb-2">Abrí la caja compartida para registrar cobros.</p>}<button disabled={saving||!sessionId||!panelCustomer||!panelCart.items.length} onClick={register} className="w-full py-3 rounded-xl bg-burgundy text-cream font-bold disabled:opacity-40">{saving?'Registrando...':'Confirmar venta'}</button></>:<div className="w-full px-4 py-3 rounded-xl bg-stone-300 text-stone-600 text-center font-body text-sm font-bold">Seleccionar carrito {index+1}</div>}
      </div>
     </section>
    })}
   </div>
  </div>
  {weighing&&<Weigh product={weighing} scale={scale} onClose={()=>setWeighing(null)} onAdd={kg=>{add(weighing,kg,weighingCartRef.current);setWeighing(null)}}/>}
  {lastTransfer&&<TransferReceipt receipt={lastTransfer}/>}
 </div>
 return <div className="max-w-6xl mx-auto"><div className="mb-6"><h1 className="font-sans text-3xl font-bold text-charcoal">Mostrador mayorista</h1><p className="font-body text-warm-gray mt-1">Dos pedidos simultáneos, clientes y cuenta corriente.</p></div><WholesaleTabs tab={tab} setTab={setTab} role={role}/>{error&&<div className="mb-4 px-4 py-3 rounded-xl border bg-red-50 border-red-200 text-red-700 text-sm">{error}</div>}{message&&<div className="mb-4 px-4 py-3 rounded-xl border bg-green-50 border-green-200 text-green-800 text-sm">{message}</div>}
 {tab==='customers'?<Customers customers={customers} balances={Object.fromEntries(customers.map(c=>[c.id,balanceFor(c.id)]))} admin={role==='admin'} onNew={()=>setModal('new')} onEdit={setModal} onToggle={toggle} onPay={setPaymentCustomer} onLedger={setLedgerCustomer}/>:<PriceTable products={products} costFor={costFor} markupDrafts={markupDrafts} priceDrafts={priceDrafts} setMarkupDrafts={setMarkupDrafts} setPriceDrafts={setPriceDrafts} draftPrice={draftPrice} onSave={savePrice}/>} {weighing&&<Weigh product={weighing} scale={scale} onClose={()=>setWeighing(null)} onAdd={kg=>{add(weighing,kg);setWeighing(null)}}/>}{modal&&<CustomerModal customer={modal} onClose={()=>setModal(null)} onSave={saveCustomer}/>} {ledgerCustomer&&<WholesaleLedger supabase={supabase} customer={ledgerCustomer} onClose={()=>setLedgerCustomer(null)}/>} {paymentCustomer&&<Payment customer={paymentCustomer} balance={balanceFor(paymentCustomer.id)} onClose={()=>setPaymentCustomer(null)} onSave={pay}/>} {lastTransfer&&<TransferReceipt receipt={lastTransfer}/>}</div>
}
function Shell({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}><div className="bg-white rounded-3xl w-full max-w-md" onClick={e=>e.stopPropagation()}><div className="p-4 border-b flex justify-between"><b>{title}</b><button onClick={onClose}><X/></button></div><div className="p-5">{children}</div></div></div>}
function WholesaleTabs({tab,setTab,role}:{tab:Tab;setTab:(tab:Tab)=>void;role:Role}){
 const tabs:{value:Tab;label:string;Icon:typeof ShoppingCart}[]=[{value:'sale',label:'Nueva venta',Icon:ShoppingCart},{value:'customers',label:'Clientes y cuentas',Icon:Users},...(role==='admin'?[{value:'prices' as Tab,label:'Precios',Icon:Save}]:[])]
 return <div className="flex flex-wrap gap-2 mb-5 bg-white border border-border rounded-xl p-1 w-fit">{tabs.map(({value,label,Icon})=><button key={value} onClick={()=>setTab(value)} className={`px-4 py-2 rounded-lg text-sm font-semibold flex gap-2 items-center ${tab===value?'bg-burgundy text-cream':'text-warm-gray'}`}><Icon size={16}/>{label}</button>)}</div>
}
function Customers({customers,balances,admin,onNew,onEdit,onToggle,onPay,onLedger}:{customers:Customer[];balances:Record<string,number>;admin:boolean;onNew:()=>void;onEdit:(c:Customer)=>void;onToggle:(c:Customer)=>void;onPay:(c:Customer)=>void;onLedger:(c:Customer)=>void}){
 const [query,setQuery]=useState('')
 const normalized=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 const shown=customers.filter(c=>`${c.business_name} ${c.contact_name} ${c.phone}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(normalized))
 return <div><div className="flex flex-wrap gap-3 mb-4"><button onClick={onNew} className="px-4 py-2 bg-burgundy text-cream rounded-xl">Nuevo comercio</button><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar comercio por nombre" className={`${cls} max-w-sm`}/></div><div className="bg-white rounded-2xl border overflow-x-auto"><table className="w-full min-w-[560px]"><thead><tr className="bg-cream-dark text-left text-xs text-warm-gray"><th className="p-3">Comercio</th><th className="p-3 text-right">Saldo</th><th className="p-3 text-right">Acciones</th></tr></thead><tbody>{shown.map(c=>{const balance=balances[c.id]??0;return <tr key={c.id} className={`border-b ${!c.active?'opacity-50':''}`}><td className="p-3"><b>{c.business_name}</b><div className="text-xs text-warm-gray">{c.contact_name||c.phone||'—'} {!c.active&&'· Dado de baja'}</div></td><td className={`p-3 text-right font-num font-bold ${balance>0?'text-red-600':'text-charcoal'}`}>{fmt(balance)}</td><td className="p-3 text-right"><button onClick={()=>onLedger(c)} className="border rounded px-2 py-1 text-xs mr-2">Movimientos</button>{admin&&<button onClick={()=>onEdit(c)} className="border rounded px-2 py-1 text-xs mr-2">Editar</button>}{c.has_current_account&&balance>0&&<button onClick={()=>onPay(c)} className="border rounded px-2 py-1 text-xs mr-2">Cobrar saldo</button>}{admin&&<button onClick={()=>onToggle(c)} className="border rounded px-2 py-1 text-xs">{c.active?'Dar de baja':'Reactivar'}</button>}</td></tr>})}{shown.length===0&&<tr><td colSpan={3} className="p-8 text-center text-warm-gray">Sin clientes que coincidan.</td></tr>}</tbody></table></div></div>
}
function CustomerModal({customer,onClose,onSave}:{customer:Customer|'new';onClose:()=>void;onSave:(c:Customer)=>Promise<string|null>}){const[f,setF]=useState<Customer>(customer==='new'?{id:'',business_name:'',contact_name:'',tax_id:'',phone:'',address:'',has_current_account:false,active:true}:customer),[err,setErr]=useState('');return <Shell title={customer==='new'?'Nuevo comercio':'Editar comercio'} onClose={onClose}><div className="space-y-3">{([['business_name','Comercio'],['contact_name','Contacto'],['tax_id','CUIT'],['phone','Teléfono'],['address','Dirección']]as const).map(([k,l])=><input key={k} placeholder={l} value={f[k]} onChange={e=>setF({...f,[k]:e.target.value})} className={cls}/>)}<label className="block text-sm"><input type="checkbox" checked={f.has_current_account} onChange={e=>setF({...f,has_current_account:e.target.checked})}/> Habilitar cuenta corriente</label>{err&&<p className="text-red-600 text-sm">{err}</p>}<button className="w-full py-3 bg-burgundy text-cream rounded-xl" onClick={async()=>{if(!f.business_name.trim())return;const e=await onSave({...f,id:f.id||crypto.randomUUID(),business_name:f.business_name.trim()});if(e)setErr(e)}}>Guardar comercio</button></div></Shell>}
function Payment({customer,balance,onClose,onSave}:{customer:Customer;balance:number;onClose:()=>void;onSave:(c:Customer,a:number,m:'Efectivo'|'Transferencia')=>Promise<string|null>}){
 const [amount,setAmount]=useState(String(balance)),[method,setMethod]=useState<'Efectivo'|'Transferencia'>('Efectivo'),[error,setError]=useState(''),[saving,setSaving]=useState(false)
 const savingRef=useRef(false)
 const submit=async()=>{
  if(savingRef.current)return
  const value=parse(amount)
  if(!Number.isFinite(value)||value<=0||value>balance){setError('El importe debe ser mayor que cero y no superar el saldo.');return}
  savingRef.current=true;setSaving(true);setError('')
  const result=await onSave(customer,value,method)
  if(result){setError(result);savingRef.current=false;setSaving(false)}
 }
 return <Shell title={`Cobro de ${customer.business_name}`} onClose={onClose}><p className="text-sm text-warm-gray mb-3">Saldo pendiente: {fmt(balance)}</p><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="Importe" className={cls}/><select value={method} onChange={e=>setMethod(e.target.value as typeof method)} className={`${cls} mt-3`}><option>Efectivo</option><option>Transferencia</option></select>{error&&<p className="text-red-600 text-sm mt-2">{error}</p>}<button disabled={saving} className="w-full mt-3 py-3 bg-burgundy text-cream rounded-xl disabled:opacity-40" onClick={()=>void submit()}>{saving?'Registrando...':'Registrar cobro'}</button></Shell>
}
function Weigh({product,scale,onClose,onAdd}:{product:Product;scale:ReturnType<typeof useScale>;onClose:()=>void;onAdd:(kg:number)=>void}){const[v,setV]=useState('');useEffect(()=>{if(scale.connected&&scale.live&&scale.weight!=null)setV(scale.weight>EMPTY_KG?scale.weight.toFixed(3):'')},[scale.connected,scale.live,scale.weight]);const kg=parse(v);return <Shell title={`Pesar ${product.name}`} onClose={onClose}><div className="text-center text-4xl font-num font-bold mb-4"><Scale className="inline mr-2"/>{scale.weight?.toFixed(3).replace('.',',')??'—'} kg</div><input value={v} onChange={e=>setV(e.target.value)} inputMode="decimal" className={cls} placeholder="0,500"/><button disabled={!Number.isFinite(kg)||kg<=0||(scale.connected&&!scale.stable)} onClick={()=>onAdd(Math.round(kg*1000)/1000)} className="w-full mt-3 py-3 bg-burgundy text-cream rounded-xl disabled:opacity-40">Agregar al carrito</button></Shell>}

function PriceTable({products,costFor,markupDrafts,priceDrafts,setMarkupDrafts,setPriceDrafts,draftPrice,onSave}:{products:Product[];costFor:(id:string)=>number|null;markupDrafts:Record<string,string>;priceDrafts:Record<string,string>;setMarkupDrafts:React.Dispatch<React.SetStateAction<Record<string,string>>>;setPriceDrafts:React.Dispatch<React.SetStateAction<Record<string,string>>>;draftPrice:(product:Product)=>number;onSave:(product:Product)=>void}){return <div className="bg-white rounded-2xl border overflow-x-auto"><div className="p-4 border-b text-sm text-warm-gray">Con receta se calcula por costo y margen. Sin receta, se carga el precio manual. Los productos ocultos también se administran acá.</div><table className="w-full"><thead><tr className="bg-cream-dark text-left text-xs text-warm-gray"><th className="p-3">Producto</th><th className="p-3 text-right">Costo</th><th className="p-3">Margen %</th><th className="p-3">Precio mayorista</th><th/></tr></thead><tbody>{products.map(product=>{const cost=costFor(product.id);return <tr key={product.id} className="border-b"><td className="p-3 font-semibold">{product.name}<div className="text-xs text-warm-gray">{product.show_on_pos===false?'Oculto del mostrador':'Visible en mostrador'}</div></td><td className="p-3 text-right font-num">{cost===null?'Sin receta':fmt(cost)}</td><td className="p-3"><input disabled={cost===null} value={markupDrafts[product.id]??''} onChange={e=>setMarkupDrafts(old=>({...old,[product.id]:e.target.value}))} className="w-24 border rounded p-2 disabled:bg-cream-dark" placeholder="0"/></td><td className="p-3"><input disabled={cost!==null} value={cost===null?priceDrafts[product.id]??'':String(draftPrice(product))} onChange={e=>setPriceDrafts(old=>({...old,[product.id]:e.target.value}))} className="w-32 border rounded p-2 disabled:bg-cream-dark"/></td><td className="p-3"><button onClick={()=>onSave(product)} className="p-2 border rounded text-burgundy"><Save size={15}/></button></td></tr>})}</tbody></table></div>}

function ScaleBar({scale}:{scale:ReturnType<typeof useScale>}){if(!scale.supported)return <div className="flex gap-2 items-center p-3 rounded-xl border bg-amber-50 text-amber-800 text-sm"><AlertTriangle size={16}/>Este navegador no permite leer la balanza. Podés escribir el peso manualmente.</div>;const state=!scale.connected?['Balanza desconectada','bg-cream-dark text-warm-gray']:!scale.live?['Sin lectura','bg-red-100 text-red-700']:!scale.hasLoad?['Plato vacío','bg-cream-dark text-warm-gray']:scale.stable?['Peso estable','bg-green-100 text-green-700']:['Estabilizando…','bg-amber-100 text-amber-700'];return <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white border rounded-xl shadow-sm"><div className="flex items-center gap-3"><Scale size={24} className={scale.live?'text-green-600':'text-warm-gray'}/><span className="font-num font-bold text-3xl">{scale.live&&scale.weight!==null?`${scale.weight.toFixed(3).replace('.',',')} kg`:'—'}</span><span className={`px-2 py-1 rounded-full text-xs font-semibold ${state[1]}`}>{state[0]}</span>{scale.tare>0&&<span className="text-xs text-blue-700">Tara {scale.tare.toFixed(3).replace('.',',')} kg</span>}</div><div className="flex gap-2">{!scale.connected?<button onClick={()=>void scale.connect(false)} className="flex gap-1 items-center px-3 py-2 bg-burgundy text-cream rounded-lg text-xs font-bold"><Cable size={14}/>Conectar</button>:<><button onClick={scale.tare>0?scale.clearTare:scale.applyTare} disabled={!scale.live||scale.raw===null} className="px-3 py-2 border rounded-lg text-xs disabled:opacity-40">{scale.tare>0?'Quitar tara':'Tara'}</button><button onClick={()=>void scale.disconnect()} className="px-3 py-2 border rounded-lg text-xs">Desconectar</button></>}</div></div>}

function TransferReceipt({receipt}:{receipt:{id:string;customer:string;total:number;items:CartItem[]}}){return <div className="mt-5"><div className="no-print flex items-center justify-between p-4 rounded-xl border bg-green-50"><span className="flex gap-2 items-center text-green-800 text-sm"><CheckCircle2 size={17}/>Comprobante de transferencia listo.</span><button onClick={()=>window.print()} className="flex gap-2 items-center px-4 py-2 bg-burgundy text-cream rounded-lg"><Printer size={15}/>Imprimir</button></div><div className="hidden print:block bg-white p-8"><h2 className="text-2xl font-bold">Panadería Villa · Comprobante mayorista</h2><p className="mt-3">Cliente: {receipt.customer}</p><p>Operación: {receipt.id}</p><p>Medio de pago: Transferencia</p><table className="w-full mt-6"><tbody>{receipt.items.map(item=><tr key={item.product.id} className="border-b"><td className="py-2">{item.product.name}</td><td className="py-2 text-right">{item.quantity.toLocaleString('es-AR')} {item.product.unit}</td><td className="py-2 text-right">{fmt(line(item))}</td></tr>)}</tbody></table><div className="text-right text-2xl font-bold mt-4">Total {fmt(receipt.total)}</div></div></div>}
