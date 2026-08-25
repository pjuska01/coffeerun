"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// ---- Types ----
type Shop = { id: string; name: string; address: string; phone: string; notes: string; createdAt: string };
type Menu = { id: string; shopId: string; name: string; description: string };
type Section = { id: string; menuId: string; name: string; description: string };
type Choice = { id: string; label: string; priceDelta: number };
type OptionGroup = { id: string; scope: "item" | "universal"; itemId?: string; universalId?: string; name: string; required: boolean; type: "single" | "multi"; choices: Choice[] };
type UniversalOption = { id: string; name: string; description: string; type: "single" | "multi"; required: boolean; choices: Choice[] };
type MenuItem = { id: string; shopId: string; menuId: string; sectionId: string | null; name: string; description: string; price: number; available: boolean; flaggedCount: number; flaggedReasons: string[]; optionGroupIds: string[] };
type Run = { id: string; shopId: string; menuId: string; runnerName: string; leaveInMinutes: number; capacity: number; coRunnerAllowed: boolean; coRunnerCapacity: number; status: "announcing" | "collecting" | "headingBack" | "delivered"; paymentMethods: string[]; pickupLocation: string; dropoff: boolean; createdAt: string };
type OrderItem = { itemId: string; quantity: number; selectedOptions: { groupId: string; choiceIds: string[] }[]; specialInstructions: string };
type Order = { id: string; runId: string; delivereeName: string; contactPhone: string; dropOffLocation: string; items: OrderItem[]; paymentMethod: string; pledged: boolean; paidBack: boolean; status: "pending" | "accepted" | "cannotFill"; cannotFillReason?: string; createdAt: string };
type Settings = { defaultPickup: string; defaultDropoff: boolean; paymentMethods: string[]; maxBeverageMode: "5" | "8" | "unlimited"; abGroup: "A" | "B" };
type AuthUser = { id: string; name: string; email: string; picture: string; provider: "google" | "demo" };

const PAYMENT_OPTIONS = ["Venmo", "Cash", "Paypal", "CashApp", "FB Cash", "Zelle"] as const;
const STORAGE_KEY = "coffeerun-v1";
const AUTH_STORAGE_KEY = "coffeerun-auth-v1";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch { return null; }
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}

function uid() { return Math.random().toString(36).slice(2, 9); }
function nowISO() { return new Date().toISOString(); }
function formatPrice(n: number) { return `$${n.toFixed(2)}`; }

// Isometric cup SVG generator based on item
function IsoCup({ title, price, flagged }: { title: string; price: number; flagged?: boolean }) {
  const hue = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const lid = `hsl(${30 + hue % 40} 70% 55%)`;
  const sleeve = flagged ? "#c0392b" : "#d9c8b4";
  return (
    <div className="relative w-[86px] h-[86px] shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
        {/* shadow */}
        <ellipse cx="50" cy="88" rx="22" ry="6" fill="rgba(30,18,10,0.15)" />
        {/* cup body isometric */}
        <path d="M 28 42 L 28 78 L 72 78 L 72 42 Z" fill="#fff8ec" stroke="#2c1e13" strokeWidth="1.5" />
        <path d="M 28 42 L 50 28 L 72 42 L 50 56 Z" fill={lid} stroke="#2c1e13" strokeWidth="1.5" />
        {/* sleeve */}
        <path d="M 28 54 L 72 54 L 72 66 L 28 66 Z" fill={sleeve} stroke="#2c1e13" strokeWidth="1" />
        <text x="50" y="62" textAnchor="middle" fontSize="6" fontFamily="var(--font-mono)" fill="#1e120a">{price ? formatPrice(price) : ""}</text>
        {/* steam */}
        <path d="M 42 26 Q 44 18 48 26 T 56 22" fill="none" stroke="#4a7c7e" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      </svg>
      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--amber)] border border-[#a86a1e]" />
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<"shops" | "menus" | "runs" | "orders" | "board" | "settings">("shops");
  const [shops, setShops] = useState<Shop[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [universalOptions, setUniversalOptions] = useState<UniversalOption[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Settings>({ defaultPickup: "Lobby — table by elevators", defaultDropoff: false, paymentMethods: ["Venmo", "Cash"], maxBeverageMode: "5", abGroup: "A" });
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [selectedMenuId, setSelectedMenuId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const googleSettingsBtnRef = useRef<HTMLDivElement>(null);

  // load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setShops(d.shops ?? []);
        setMenus(d.menus ?? []);
        setSections(d.sections ?? []);
        setItems(d.items ?? []);
        setOptionGroups(d.optionGroups ?? []);
        setUniversalOptions(d.universalOptions ?? []);
        setRuns(d.runs ?? []);
        setOrders(d.orders ?? []);
        setSettings(d.settings ?? { defaultPickup: "Lobby — table by elevators", defaultDropoff: false, paymentMethods: ["Venmo", "Cash"], maxBeverageMode: "5", abGroup: "A" });
        if (d.shops?.[0]) setSelectedShopId(d.shops[0].id);
        if (d.menus?.[0]) setSelectedMenuId(d.menus[0].id);
      } else {
        // seed demo
        const s: Shop = { id: "shop-demo", name: "Alley & Ember", address: "4th & Grand — Downtown", phone: "555-0142", notes: "Oat milk + single origin rotating", createdAt: nowISO() };
        const m: Menu = { id: "menu-demo", shopId: s.id, name: "Main Menu", description: "Espresso bar & drip" };
        const sec1: Section = { id: "sec-1", menuId: m.id, name: "Espresso", description: "Pulled to order" };
        const sec2: Section = { id: "sec-2", menuId: m.id, name: "Drip & Cold Brew", description: "Batch brewed" };
        const item1: MenuItem = { id: "item-1", shopId: s.id, menuId: m.id, sectionId: sec1.id, name: "Flat White", description: "Double shot, velvety milk", price: 4.75, available: true, flaggedCount: 0, flaggedReasons: [], optionGroupIds: [] };
        const item2: MenuItem = { id: "item-2", shopId: s.id, menuId: m.id, sectionId: sec1.id, name: "Cortado", description: "Equal parts espresso & milk", price: 4.25, available: true, flaggedCount: 1, flaggedReasons: ["Price marked $3.50 on board"], optionGroupIds: [] };
        const u1: UniversalOption = { id: "uni-1", name: "Milk choice", description: "Applied to most drinks", type: "single", required: false, choices: [{ id: "c1", label: "Oat", priceDelta: 0.5 }, { id: "c2", label: "Whole", priceDelta: 0 }, { id: "c3", label: "Almond", priceDelta: 0.5 }] };
        const og: OptionGroup = { id: "og-1", scope: "item", itemId: item1.id, name: "Size", required: true, type: "single", choices: [{ id: "sz-s", label: "8oz", priceDelta: 0 }, { id: "sz-l", label: "12oz", priceDelta: 1 }] };
        item1.optionGroupIds = [og.id];
        setShops([s]); setMenus([m]); setSections([sec1, sec2]); setItems([item1, item2]); setOptionGroups([og]); setUniversalOptions([u1]);
        setSelectedShopId(s.id); setSelectedMenuId(m.id);
      }
    } catch {}
    setHydrated(true);
  }, []);

  // persist
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ shops, menus, sections, items, optionGroups, universalOptions, runs, orders, settings }));
  }, [shops, menus, sections, items, optionGroups, universalOptions, runs, orders, settings, hydrated]);

  // auth: load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) setAuthUser(JSON.parse(raw));
    } catch {}
  }, []);
  // auth: persist
  useEffect(() => {
    if (!hydrated) return;
    if (authUser) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  }, [authUser, hydrated]);

  function handleCredentialResponse(response: { credential: string }) {
    const payload = decodeJwt(response.credential) as { sub?: string; name?: string; email?: string; picture?: string } | null;
    if (!payload?.sub) return;
    setAuthUser({
      id: payload.sub,
      name: payload.name || payload.email || "Google User",
      email: payload.email || "",
      picture: payload.picture || "",
      provider: "google",
    });
  }
  function signOut() {
    try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch {}
    setAuthUser(null);
  }
  function demoGoogleLogin() {
    setAuthUser({ id: "demo-" + uid(), name: "Demo Barista", email: "demo@coffeerun.local", picture: "", provider: "demo" });
  }
  // load Google Identity Services
  useEffect(() => {
    if (authUser) return;
    if (!GOOGLE_CLIENT_ID) return;
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredentialResponse, auto_select: false });
        if (googleBtnRef.current) {
          googleBtnRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(googleBtnRef.current, { theme: "outline", size: "medium", shape: "pill", text: "signin_with" });
        }
        if (googleSettingsBtnRef.current) {
          googleSettingsBtnRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(googleSettingsBtnRef.current, { theme: "outline", size: "large", shape: "rectangular", text: "continue_with", width: 320 });
        }
      } catch {}
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => {
      try {
        window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredentialResponse, auto_select: false });
        if (googleBtnRef.current) {
          googleBtnRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(googleBtnRef.current, { theme: "outline", size: "medium", shape: "pill", text: "signin_with" });
        }
        if (googleSettingsBtnRef.current) {
          googleSettingsBtnRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(googleSettingsBtnRef.current, { theme: "outline", size: "large", shape: "rectangular", text: "continue_with", width: 320 });
        }
      } catch {}
    };
    document.head.appendChild(s);
    return () => { try { s.remove(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [GOOGLE_CLIENT_ID, authUser, hydrated]);

  const selectedShop = useMemo(() => shops.find(s => s.id === selectedShopId) ?? shops[0], [shops, selectedShopId]);
  const selectedMenu = useMemo(() => menus.find(m => m.id === selectedMenuId) ?? menus.find(m => m.shopId === selectedShop?.id), [menus, selectedMenuId, selectedShop]);
  const visibleSections = useMemo(() => sections.filter(s => s.menuId === selectedMenu?.id), [sections, selectedMenu]);
  const visibleItems = useMemo(() => items.filter(i => i.menuId === selectedMenu?.id), [items, selectedMenu]);
  const shopMenus = useMemo(() => menus.filter(m => m.shopId === selectedShop?.id), [menus, selectedShop]);

  // ---- shop handlers ----
  const [shopForm, setShopForm] = useState({ name: "", address: "", phone: "", notes: "" });
  function addShop() {
    if (!shopForm.name.trim()) return;
    const s: Shop = { id: uid(), name: shopForm.name.trim(), address: shopForm.address.trim(), phone: shopForm.phone.trim(), notes: shopForm.notes.trim(), createdAt: nowISO() };
    setShops(v => [s, ...v]); setSelectedShopId(s.id); setShopForm({ name: "", address: "", phone: "", notes: "" });
  }

  // menu
  const [menuForm, setMenuForm] = useState({ name: "", description: "" });
  function addMenu() {
    if (!selectedShop) return;
    if (!menuForm.name.trim()) return;
    const m: Menu = { id: uid(), shopId: selectedShop.id, name: menuForm.name.trim(), description: menuForm.description.trim() };
    setMenus(v => [...v, m]); setSelectedMenuId(m.id); setMenuForm({ name: "", description: "" });
  }

  // section
  const [sectionForm, setSectionForm] = useState({ name: "", description: "" });
  function addSection() {
    if (!selectedMenu) return;
    if (!sectionForm.name.trim()) return;
    const s: Section = { id: uid(), menuId: selectedMenu.id, name: sectionForm.name.trim(), description: sectionForm.description.trim() };
    setSections(v => [...v, s]); setSectionForm({ name: "", description: "" });
  }

  // item
  const [itemForm, setItemForm] = useState({ name: "", description: "", price: "", sectionId: "", available: true });
  function addItem() {
    if (!selectedShop || !selectedMenu) return;
    if (!itemForm.name.trim()) return;
    const price = parseFloat(itemForm.price) || 0;
    const mi: MenuItem = { id: uid(), shopId: selectedShop.id, menuId: selectedMenu.id, sectionId: itemForm.sectionId || null, name: itemForm.name.trim(), description: itemForm.description.trim(), price, available: itemForm.available, flaggedCount: 0, flaggedReasons: [], optionGroupIds: [] };
    setItems(v => [...v, mi]); setItemForm({ name: "", description: "", price: "", sectionId: "", available: true });
  }

  // option group
  const [optForm, setOptForm] = useState({ itemId: "", name: "", type: "single" as "single"|"multi", required: false, choicesText: "" });
  function addOptionGroup() {
    if (!optForm.name.trim() || !optForm.itemId) return;
    const choices: Choice[] = optForm.choicesText.split(",").map(s => s.trim()).filter(Boolean).map(label => {
      const [l, p] = label.split(":").map(x=>x.trim());
      return { id: uid(), label: l, priceDelta: parseFloat(p || "0") || 0 };
    });
    if (choices.length === 0) return;
    const og: OptionGroup = { id: uid(), scope: "item", itemId: optForm.itemId, name: optForm.name.trim(), type: optForm.type, required: optForm.required, choices };
    setOptionGroups(v => [...v, og]);
    setItems(v => v.map(it => it.id === optForm.itemId ? { ...it, optionGroupIds: [...it.optionGroupIds, og.id] } : it));
    setOptForm({ itemId: "", name: "", type: "single", required: false, choicesText: "" });
  }

  // universal
  const [uniForm, setUniForm] = useState({ name: "", description: "", type: "single" as "single"|"multi", required: false, choicesText: "" });
  function addUniversal() {
    if (!uniForm.name.trim()) return;
    const choices: Choice[] = uniForm.choicesText.split(",").map(s=>s.trim()).filter(Boolean).map(label=>{
      const [l,p]=label.split(":").map(x=>x.trim());
      return { id: uid(), label:l, priceDelta: parseFloat(p||"0")||0 };
    });
    if (!choices.length) return;
    const u: UniversalOption = { id: uid(), name: uniForm.name.trim(), description: uniForm.description.trim(), type: uniForm.type, required: uniForm.required, choices };
    setUniversalOptions(v=>[...v,u]); setUniForm({ name:"", description:"", type:"single", required:false, choicesText:"" });
  }
  function applyUniversalToItem(universalId: string, itemId: string) {
    const uni = universalOptions.find(u=>u.id===universalId);
    if (!uni || !itemId) return;
    const og: OptionGroup = { id: uid(), scope: "universal", universalId, itemId, name: uni.name, type: uni.type, required: uni.required, choices: uni.choices.map(c=>({...c, id: uid()})) };
    setOptionGroups(v=>[...v, og]);
    setItems(v=>v.map(it=>it.id===itemId ? { ...it, optionGroupIds:[...it.optionGroupIds, og.id] } : it));
  }

  // flag item needs adjusting
  function flagItem(itemId: string, reason: string) {
    setItems(v=>v.map(it=>it.id===itemId ? { ...it, flaggedCount: it.flaggedCount+1, flaggedReasons: [...it.flaggedReasons, reason || "Flagged as inaccurate"] } : it));
  }

  // ---- runs ----
  const [runForm, setRunForm] = useState({ shopId: "", menuId: "", runnerName: "", leaveIn: "15", capacity: "4", coRunnerAllowed: false, coRunnerCapacity: "2", pickupLocation: "", dropoff: false, paymentMethods: [] as string[] });
  useEffect(()=>{ if (selectedShop && !runForm.shopId) setRunForm(f=>({ ...f, shopId: selectedShop.id, pickupLocation: settings.defaultPickup, dropoff: settings.defaultDropoff, paymentMethods: settings.paymentMethods })); }, [selectedShop, settings, runForm.shopId]);
  function createRun() {
    if (!runForm.shopId || !runForm.runnerName.trim()) return;
    const menuId = runForm.menuId || menus.find(m=>m.shopId===runForm.shopId)?.id || "";
    const r: Run = { id: uid(), shopId: runForm.shopId, menuId, runnerName: runForm.runnerName.trim(), leaveInMinutes: parseInt(runForm.leaveIn)||15, capacity: parseInt(runForm.capacity)||4, coRunnerAllowed: runForm.coRunnerAllowed, coRunnerCapacity: parseInt(runForm.coRunnerCapacity)||2, status:"announcing", paymentMethods: runForm.paymentMethods.length? runForm.paymentMethods : settings.paymentMethods, pickupLocation: runForm.pickupLocation || settings.defaultPickup, dropoff: runForm.dropoff, createdAt: nowISO() };
    setRuns(v=>[r, ...v]);
    setRunForm(f=>({ ...f, runnerName:"", leaveIn:"15", capacity:"4" }));
  }

  // ---- orders ----
  const [orderForm, setOrderForm] = useState<{ runId:string; delivereeName:string; contactPhone:string; dropOffLocation:string; paymentMethod:string; pledged:boolean; selected: Record<string,{ quantity:number; choices: Record<string,string[]>}> }>({ runId:"", delivereeName:"", contactPhone:"", dropOffLocation:"", paymentMethod:"", pledged:false, selected:{} });
  const activeRun = useMemo(()=> runs.find(r=>r.id===orderForm.runId) ?? runs[0], [runs, orderForm.runId]);
  const activeRunMenuItems = useMemo(()=> activeRun ? items.filter(i=>i.menuId===activeRun.menuId && i.available) : [], [activeRun, items]);
  const totalBeveragesInOrder = useMemo(()=> Object.values(orderForm.selected).reduce((a, v)=>a+(v.quantity||0),0), [orderForm.selected]);
  const maxForRun = useMemo(()=> {
    if (settings.maxBeverageMode==="unlimited") return 999;
    if (settings.maxBeverageMode==="8") return 8;
    return 5;
  }, [settings.maxBeverageMode]);
  const canPlaceOrder = useMemo(()=> {
    if (!activeRun || !orderForm.delivereeName.trim() || !orderForm.pledged) return false;
    if (totalBeveragesInOrder===0) return false;
    if (totalBeveragesInOrder>maxForRun) return false;
    if (!orderForm.contactPhone.trim()) return false;
    if (!orderForm.paymentMethod) return false;
    if (!activeRun.paymentMethods.includes(orderForm.paymentMethod)) return false;
    if (activeRun.dropoff && !orderForm.dropOffLocation.trim()) return false;
    return true;
  }, [activeRun, orderForm, totalBeveragesInOrder, maxForRun]);

  function placeOrder() {
    if (!canPlaceOrder || !activeRun) return;
    const orderItems: OrderItem[] = Object.entries(orderForm.selected).filter(([,v])=>v.quantity>0).map(([itemId, v])=>{
      const item = items.find(it=>it.id===itemId);
      const groups = item ? optionGroups.filter(og=> og.itemId===itemId) : [];
      return {
        itemId, quantity: v.quantity, specialInstructions: "",
        selectedOptions: groups.map(g=>({ groupId:g.id, choiceIds: v.choices[g.id] || [] }))
      };
    });
    const o: Order = { id: uid(), runId: activeRun.id, delivereeName: orderForm.delivereeName.trim(), contactPhone: orderForm.contactPhone.trim(), dropOffLocation: orderForm.dropOffLocation.trim(), items: orderItems, paymentMethod: orderForm.paymentMethod, pledged: true, paidBack:false, status:"pending", createdAt: nowISO() };
    setOrders(v=>[o, ...v]);
    setOrderForm({ runId: activeRun.id, delivereeName:"", contactPhone:"", dropOffLocation:"", paymentMethod:"", pledged:false, selected:{} });
  }

  function updateOrderStatus(orderId: string, status: Order["status"], reason?: string) {
    setOrders(v=>v.map(o=>o.id===orderId ? { ...o, status, cannotFillReason: reason } : o));
  }
  function markPaidBack(orderId: string) { setOrders(v=>v.map(o=>o.id===orderId ? { ...o, paidBack:true } : o)); }
  function updateRunStatus(runId: string, status: Run["status"]) { setRuns(v=>v.map(r=>r.id===runId?{ ...r, status }:r)); }

  // derived stats
  const totalOrdersValue = (order: Order) => order.items.reduce((sum, oi)=>{
    const it = items.find(i=>i.id===oi.itemId);
    if (!it) return sum;
    let price = it.price * oi.quantity;
    oi.selectedOptions.forEach(sel=>{
      const grp = optionGroups.find(g=>g.id===sel.groupId);
      sel.choiceIds.forEach(cid=>{
        const c = grp?.choices.find(ch=>ch.id===cid);
        if (c) price += c.priceDelta * oi.quantity;
      });
    });
    return sum + price;
  },0);

  if (!hydrated) return <div className="min-h-screen grid place-items-center mono text-sm">Loading CoffeeRun…</div>;

  return (
    <div className="min-h-screen flex flex-col">
      {/* header */}
      <header className="sticky top-0 z-30 wood-panel">
        <div className="mx-auto max-w-[1240px] px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[10px] brass grid place-items-center text-[18px] font-bold" style={{ fontFamily:"var(--font-display)" }}>CR</div>
            <div>
              <div className="display text-[18px] leading-none">CoffeeRun</div>
              <div className="mono text-[10px] tracking-widest opacity-70">ISOMETRIC OFFICE CARAVAN — BUILD {shops.length} SHOPS • {runs.length} RUNS</div>
            </div>
          </div>
          <nav className="ml-6 hidden md:flex gap-1.5">
            {([
              ["shops","Shops"],
              ["menus","Menus & Items"],
              ["runs","Runs"],
              ["orders","Order"],
              ["board","Board"],
              ["settings","Settings"],
            ] as const).map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} className={`px-3.5 py-2 rounded-full text-sm font-medium border transition ${tab===id ? "bg-[var(--paper)] text-[var(--espresso)] border-[var(--paper)]" : "bg-white/10 text-[#f6eed8] border-white/20 hover:bg-white/15"}`}>{label}</button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:inline mono text-xs px-2.5 py-1 rounded-full bg-white/10 border border-white/15">A/B: {settings.abGroup} • cap {settings.maxBeverageMode}</span>
            {authUser ? (
              <div className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-full pl-1 pr-2 py-1">
                {authUser.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={authUser.picture} alt={authUser.name} className="w-7 h-7 rounded-full object-cover border border-white/20" />
                ) : (
                  <div className="w-7 h-7 rounded-full brass grid place-items-center text-xs font-bold text-[#1e120a]">{authUser.name.slice(0,1).toUpperCase()}</div>
                )}
                <span className="hidden sm:inline mono text-xs text-[#f6eed8] max-w-[120px] truncate">{authUser.name}</span>
                <button onClick={signOut} className="mono text-[11px] px-2 py-1 rounded-full bg-white text-[#3d2516] hover:bg-[#f6eed8]">Sign out</button>
              </div>
            ) : GOOGLE_CLIENT_ID ? (
              <div ref={googleBtnRef} className="min-w-[160px] min-h-[36px] grid place-items-center bg-white rounded-full p-0.5" />
            ) : (
              <button onClick={demoGoogleLogin} className="mono text-xs px-3.5 py-2 rounded-full bg-white text-[#3d2516] border border-white flex items-center gap-2 hover:bg-[#f6eed8]">
                <span className="w-4 h-4 rounded-full bg-[#DB4437] grid place-items-center text-[10px] font-bold text-white">G</span>
                Sign in with Google
              </button>
            )}
            <button onClick={()=>{
              if(confirm("Reset all demo data?")) { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(AUTH_STORAGE_KEY); location.reload(); }
            }} className="mono text-xs px-3 py-1.5 rounded-full bg-white text-[#3d2516]">Reset</button>
          </div>
        </div>
        <div className="md:hidden px-4 pb-3 flex gap-1.5 overflow-x-auto">
          {(["shops","menus","runs","orders","board","settings"] as const).map(id=>(
            <button key={id} onClick={()=>setTab(id)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs border ${tab===id?"bg-[var(--paper)] text-[var(--espresso)]":"bg-white/10 text-[#f6eed8] border-white/20"}`}>{id}</button>
          ))}
        </div>
      </header>

      {/* isometric accent stripe */}
      <div className="h-[6px] brass" />

      <main className="mx-auto w-full max-w-[1240px] px-4 py-6 flex-1">
        {/* SHOPS */}
        {tab==="shops" && (
          <div className="grid lg:grid-cols-[380px_1fr] gap-6">
            <div className="iso-building p-5">
              <h2 className="display text-xl">Capture a new coffee shop</h2>
              <p className="text-sm text-[var(--muted)] mt-1">COFFEE-9 — every shop is a building on your office map.</p>
              <div className="mt-4 grid gap-3">
                <input placeholder="Shop name — e.g. Alley & Ember" value={shopForm.name} onChange={e=>setShopForm({...shopForm,name:e.target.value})} className="w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--amber)]" />
                <input placeholder="Address — 4th & Grand, Downtown" value={shopForm.address} onChange={e=>setShopForm({...shopForm,address:e.target.value})} className="w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2.5 text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Phone" value={shopForm.phone} onChange={e=>setShopForm({...shopForm,phone:e.target.value})} className="w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2.5 text-sm" />
                  <input placeholder="Notes — Oat milk, single origin" value={shopForm.notes} onChange={e=>setShopForm({...shopForm,notes:e.target.value})} className="w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2.5 text-sm" />
                </div>
                <button onClick={addShop} className="brass rounded-[10px] px-4 py-2.5 text-sm font-semibold text-[#1e120a]">Add shop</button>
              </div>

              <div className="mt-6">
                <h3 className="mono text-xs tracking-widest opacity-60">YOUR BLOCK — {shops.length} SHOPS</h3>
                <div className="mt-3 grid gap-2">
                  {shops.map(s=>(
                    <button key={s.id} onClick={()=>setSelectedShopId(s.id)} className={`text-left rounded-[12px] border p-3 flex gap-3 items-center ${selectedShopId===s.id?"bg-[var(--teal-light)] border-[var(--teal)]":"bg-white border-[var(--line)] hover:border-[var(--amber)]"}`}>
                      <IsoCup title={s.name} price={0} />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm leading-tight truncate">{s.name}</div>
                        <div className="text-xs text-[var(--muted)] truncate">{s.address || "No address"} • {s.phone || "no phone"}</div>
                        <div className="mono text-[10px] opacity-60">{new Date(s.createdAt).toLocaleDateString()}</div>
                      </div>
                    </button>
                  ))}
                  {shops.length===0 && <div className="mono text-xs p-3 bg-white border border-dashed rounded-[10px]">No shops yet. Add one to start.</div>}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="iso-building iso-extrude p-5 tile-grid">
                <div className="flex items-center justify-between">
                  <h3 className="display text-lg">Isometric block view</h3>
                  <span className="mono text-xs px-2 py-1 rounded-full bg-white border">3D • COFFEE-28</span>
                </div>
                <div className="mt-4 iso-scene">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {shops.map((s,i)=>(
                      <div key={s.id} className="iso-building p-3" style={{ transform:`translateZ(${i*2}px)` }}>
                        <div className="h-2 brass rounded-full mb-2" />
                        <div className="font-semibold text-sm">{s.name}</div>
                        <div className="text-xs text-[var(--muted)]">{menus.filter(m=>m.shopId===s.id).length} menus • {items.filter(it=>it.shopId===s.id).length} items</div>
                        <div className="mt-2 flex gap-1">
                          <span className="w-6 h-6 rounded-[7px] bg-[var(--paper)] border grid place-items-center text-xs">☕</span>
                          <span className="w-6 h-6 rounded-[7px] bg-[var(--teal-light)] border grid place-items-center text-xs">◧</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mono text-xs mt-4 opacity-60">Tilted ground, extruded cards, brass rivets — no purple gradients, no bento.</p>
              </div>

              {selectedShop && (
                <div className="iso-building p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{selectedShop.name}</h3>
                      <div className="text-sm text-[var(--muted)]">{selectedShop.address} • {selectedShop.phone}</div>
                      {selectedShop.notes && <div className="text-sm mt-1 bg-[var(--cream)] border border-[var(--line)] rounded-[10px] px-3 py-2">{selectedShop.notes}</div>}
                    </div>
                    <button onClick={()=>{
                      setShops(v=>v.filter(s=>s.id!==selectedShop.id));
                      setMenus(v=>v.filter(m=>m.shopId!==selectedShop.id));
                      setItems(v=>v.filter(it=>it.shopId!==selectedShop.id));
                    }} className="mono text-xs px-3 py-1.5 rounded-full border hover:bg-red-50">Remove</button>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-[10px] bg-white border p-3">
                      <div className="mono text-[11px] opacity-60">MENUS</div>
                      <div className="text-xl font-bold">{shopMenus.length}</div>
                      <div className="text-xs text-[var(--muted)]">COFFEE-10</div>
                    </div>
                    <div className="rounded-[10px] bg-white border p-3">
                      <div className="mono text-[11px] opacity-60">SECTIONS</div>
                      <div className="text-xl font-bold">{sections.filter(s=> menus.find(m=>m.id===s.menuId && m.shopId===selectedShop.id)).length}</div>
                      <div className="text-xs text-[var(--muted)]">COFFEE-11</div>
                    </div>
                    <div className="rounded-[10px] bg-white border p-3">
                      <div className="mono text-[11px] opacity-60">ITEMS</div>
                      <div className="text-xl font-bold">{items.filter(it=>it.shopId===selectedShop.id).length}</div>
                      <div className="text-xs text-[var(--muted)]">COFFEE-12</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MENUS */}
        {tab==="menus" && (
          <div className="space-y-6">
            {!selectedShop ? <div className="iso-building p-6 mono text-sm">Create a shop first in Shops tab.</div> : (
              <>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="mono text-xs px-2.5 py-1 rounded-full bg-white border">Shop: <b>{selectedShop.name}</b></span>
                  <span className="mono text-xs opacity-60">COFFEE-10 → 14</span>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                  <div className="iso-building p-5">
                    <h3 className="font-semibold">Add a menu to this shop</h3>
                    <p className="text-xs text-[var(--muted)]">COFFEE-10</p>
                    <div className="mt-3 grid gap-2">
                      <input placeholder="Menu name — Main, Seasonal, etc" value={menuForm.name} onChange={e=>setMenuForm({...menuForm,name:e.target.value})} className="rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-sm" />
                      <input placeholder="Description" value={menuForm.description} onChange={e=>setMenuForm({...menuForm,description:e.target.value})} className="rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-sm" />
                      <button onClick={addMenu} className="brass rounded-[10px] px-4 py-2 text-sm font-semibold">Add menu</button>
                    </div>
                    <div className="mt-4 grid gap-2">
                      {shopMenus.map(m=>(
                        <button key={m.id} onClick={()=>setSelectedMenuId(m.id)} className={`text-left rounded-[10px] border px-3 py-2.5 ${selectedMenuId===m.id?"bg-[var(--teal-light)] border-[var(--teal)]":"bg-white border-[var(--line)]"}`}>
                          <div className="font-medium text-sm">{m.name}</div>
                          <div className="text-xs text-[var(--muted)]">{m.description || "No description"} • {sections.filter(s=>s.menuId===m.id).length} sections</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="iso-building p-5">
                    <h3 className="font-semibold">Add a menu section</h3>
                    <p className="text-xs text-[var(--muted)]">COFFEE-11 — sections live inside a menu</p>
                    {!selectedMenu ? <div className="mono text-xs mt-3 p-3 bg-white border border-dashed rounded-[10px]">Pick a menu</div> : (
                      <>
                        <div className="mt-3 grid gap-2">
                          <input placeholder="Section — Espresso, Pastries, etc" value={sectionForm.name} onChange={e=>setSectionForm({...sectionForm,name:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                          <input placeholder="Description" value={sectionForm.description} onChange={e=>setSectionForm({...sectionForm,description:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                          <button onClick={addSection} className="rounded-[10px] bg-[var(--espresso)] text-white px-4 py-2 text-sm font-medium">Add section</button>
                        </div>
                        <div className="mt-4 grid gap-2">
                          {visibleSections.map(s=>(
                            <div key={s.id} className="rounded-[10px] bg-white border px-3 py-2.5">
                              <div className="font-medium text-sm">{s.name}</div>
                              <div className="text-xs text-[var(--muted)]">{s.description}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="iso-building p-5">
                    <h3 className="font-semibold">Universal menu item options</h3>
                    <p className="text-xs text-[var(--muted)]">COFFEE-14 — define once, apply to any item (COFFEE-13 is per-item)</p>
                    <div className="mt-3 grid gap-2">
                      <input placeholder="Option name — Milk choice, Sweetness" value={uniForm.name} onChange={e=>setUniForm({...uniForm,name:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                      <input placeholder="Description" value={uniForm.description} onChange={e=>setUniForm({...uniForm,description:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                      <div className="grid grid-cols-2 gap-2">
                        <select value={uniForm.type} onChange={e=>setUniForm({...uniForm,type:e.target.value as "single" | "multi"})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]"><option value="single">Single select</option><option value="multi">Multi select</option></select>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={uniForm.required} onChange={e=>setUniForm({...uniForm,required:e.target.checked})} /> Required</label>
                      </div>
                      <input placeholder='Choices — Oat:0.5, Whole:0, Almond:0.5' value={uniForm.choicesText} onChange={e=>setUniForm({...uniForm,choicesText:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                      <button onClick={addUniversal} className="rounded-[10px] bg-white border px-4 py-2 text-sm font-medium hover:bg-[var(--cream)]">Create universal option</button>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {universalOptions.map(u=>(
                        <div key={u.id} className="rounded-[10px] bg-white border px-3 py-2.5 flex gap-2 items-center">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{u.name} <span className="mono text-xs opacity-60">• {u.type}{u.required ? " • required":""}</span></div>
                            <div className="text-xs text-[var(--muted)] truncate">{u.choices.map(c=>`${c.label}${c.priceDelta?` (+${formatPrice(c.priceDelta)})`:""}`).join(" · ")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
                  <div className="iso-building p-5">
                    <h3 className="font-semibold">Add a menu item</h3>
                    <p className="text-xs text-[var(--muted)]">COFFEE-12 — to a menu section or directly to a menu</p>
                    {!selectedMenu ? <div className="mono text-xs mt-3">Select a menu first.</div> : (
                      <div className="mt-3 grid gap-2">
                        <div className="grid md:grid-cols-2 gap-2">
                          <input placeholder="Item name — Flat White" value={itemForm.name} onChange={e=>setItemForm({...itemForm,name:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                          <input placeholder="Price — 4.75" value={itemForm.price} onChange={e=>setItemForm({...itemForm,price:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                        </div>
                        <input placeholder="Description — Double shot, velvety milk" value={itemForm.description} onChange={e=>setItemForm({...itemForm,description:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                        <div className="grid md:grid-cols-2 gap-2">
                          <select value={itemForm.sectionId} onChange={e=>setItemForm({...itemForm,sectionId:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]">
                            <option value="">— No section (direct to menu) —</option>
                            {visibleSections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <label className="flex items-center gap-2 text-sm px-3"><input type="checkbox" checked={itemForm.available} onChange={e=>setItemForm({...itemForm,available:e.target.checked})} /> Available</label>
                        </div>
                        <button onClick={addItem} className="brass rounded-[10px] px-4 py-2.5 text-sm font-semibold">Add item</button>
                      </div>
                    )}

                    <div className="mt-6">
                      <h4 className="mono text-xs tracking-widest opacity-60">ITEMS IN {selectedMenu?.name ?? "—"} — {visibleItems.length}</h4>
                      <div className="mt-3 grid gap-3">
                        {visibleItems.map(it=>{
                          const sec = sections.find(s=>s.id===it.sectionId);
                          const groups = optionGroups.filter(g=>g.itemId===it.id);
                          return (
                            <div key={it.id} className="rounded-[12px] bg-white border p-3 flex gap-3">
                              <IsoCup title={it.name} price={it.price} flagged={it.flaggedCount>0} />
                              <div className="flex-1 min-w-0">
                                <div className="flex gap-2 items-start">
                                  <div className="flex-1">
                                    <div className="font-semibold text-sm flex gap-2 items-center">{it.name} <span className="text-xs font-normal px-1.5 py-0.5 rounded bg-[var(--cream)] border">{sec ? sec.name : "No section"}</span> {it.flaggedCount>0 && <span className="mono text-[10px] px-1.5 py-0.5 rounded bg-red-100 border border-red-200 text-red-700">⚑ {it.flaggedCount} flagged</span>}</div>
                                    <div className="text-xs text-[var(--muted)] line-clamp-2">{it.description} • {formatPrice(it.price)} {!it.available && "• unavailable"}</div>
                                    {it.flaggedReasons.length>0 && <div className="text-xs mt-1 text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">{it.flaggedReasons.slice(-2).join(" · ")}</div>}
                                  </div>
                                  <button onClick={()=>{
                                    const r = prompt("Flag reason — what needs adjusting? (name / price / description / unavailable)");
                                    if (r) flagItem(it.id, r);
                                  }} className="mono text-xs px-2.5 py-1 rounded-full border hover:bg-[var(--cream)] shrink-0">Flag</button>
                                </div>
                                {groups.length>0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {groups.map(g=>(
                                      <span key={g.id} className="mono text-[11px] px-2 py-1 rounded-full bg-[var(--teal-light)] border border-[var(--teal)]/20">{g.name}: {g.choices.map(c=>c.label).join(", ")}</span>
                                    ))}
                                  </div>
                                )}
                                {universalOptions.length>0 && (
                                  <div className="mt-2 flex gap-1 flex-wrap">
                                    {universalOptions.map(u=>(
                                      <button key={u.id} onClick={()=>applyUniversalToItem(u.id, it.id)} className="mono text-[11px] px-2 py-1 rounded-full bg-white border hover:bg-[var(--cream)]">+ {u.name}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="iso-building p-5">
                    <h3 className="font-semibold">Add menu item options</h3>
                    <p className="text-xs text-[var(--muted)]">COFFEE-13 — per-item options (size, shots, milk)</p>
                    <div className="mt-3 grid gap-2">
                      <select value={optForm.itemId} onChange={e=>setOptForm({...optForm,itemId:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]">
                        <option value="">— Select item —</option>
                        {visibleItems.map(it=><option key={it.id} value={it.id}>{it.name}</option>)}
                      </select>
                      <input placeholder="Option name — Size" value={optForm.name} onChange={e=>setOptForm({...optForm,name:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                      <div className="grid grid-cols-2 gap-2">
                        <select value={optForm.type} onChange={e=>setOptForm({...optForm,type:e.target.value as "single" | "multi"})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]"><option value="single">Single</option><option value="multi">Multi</option></select>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={optForm.required} onChange={e=>setOptForm({...optForm,required:e.target.checked})} /> Required</label>
                      </div>
                      <input placeholder="Choices — 8oz:0, 12oz:1, 16oz:1.5" value={optForm.choicesText} onChange={e=>setOptForm({...optForm,choicesText:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                      <button onClick={addOptionGroup} className="rounded-[10px] bg-[var(--espresso)] text-white px-4 py-2 text-sm font-medium">Add option to item</button>
                    </div>
                    <div className="mt-4 mono text-xs p-3 bg-[var(--cream)] border rounded-[10px]">
                      <b>Tip:</b> Universal options (COFFEE-14) can be applied to any item with the “+ Milk choice” buttons on each item card. Per-item options live only on that item.
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* RUNS */}
        {tab==="runs" && (
          <div className="grid lg:grid-cols-[420px_1fr] gap-6">
            <div className="iso-building p-5">
              <h2 className="display text-xl">Signal a coffee run</h2>
              <p className="text-xs text-[var(--muted)]">COFFEE-15 → 19, 27 — runner, timing, capacity, co-runner</p>
              <div className="mt-4 grid gap-3">
                <select value={runForm.shopId} onChange={e=>setRunForm({...runForm,shopId:e.target.value, menuId:""})} className="rounded-[10px] border bg-white px-3 py-2.5 text-sm border-[var(--line)]">
                  {shops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={runForm.menuId} onChange={e=>setRunForm({...runForm,menuId:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2.5 text-sm border-[var(--line)]">
                  <option value="">— Menu (auto) —</option>
                  {menus.filter(m=>m.shopId===runForm.shopId).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <input placeholder="Your name — Runner" value={runForm.runnerName} onChange={e=>setRunForm({...runForm,runnerName:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2.5 text-sm border-[var(--line)]" />
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">Leave in (mins)
                    <input type="number" value={runForm.leaveIn} onChange={e=>setRunForm({...runForm,leaveIn:e.target.value})} className="mt-1 w-full rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                  </label>
                  <label className="text-sm">Capacity — coffees I can carry (COFFEE-17)
                    <input type="number" value={runForm.capacity} onChange={e=>setRunForm({...runForm,capacity:e.target.value})} className="mt-1 w-full rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm p-2 rounded-[10px] bg-[var(--cream)] border">
                  <input type="checkbox" checked={runForm.coRunnerAllowed} onChange={e=>setRunForm({...runForm,coRunnerAllowed:e.target.checked})} />
                  Allow someone to “come with” as co-runner (COFFEE-18)
                </label>
                {runForm.coRunnerAllowed && (
                  <label className="text-sm">Co-runner capacity (COFFEE-19)
                    <input type="number" value={runForm.coRunnerCapacity} onChange={e=>setRunForm({...runForm,coRunnerCapacity:e.target.value})} className="mt-1 w-full rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                  </label>
                )}
                <label className="text-sm">Pickup location or dropoff (COFFEE-25)
                  <input placeholder="Lobby table by elevators, or Desk dropoff" value={runForm.pickupLocation} onChange={e=>setRunForm({...runForm,pickupLocation:e.target.value})} className="mt-1 w-full rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                </label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={runForm.dropoff} onChange={e=>setRunForm({...runForm,dropoff:e.target.checked})} /> I will drop off to individual desks</label>
                <div>
                  <div className="mono text-xs opacity-60 mb-1">Payment methods I accept (COFFEE-21)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PAYMENT_OPTIONS.map(p=>(
                      <button key={p} onClick={()=>setRunForm(f=>({ ...f, paymentMethods: f.paymentMethods.includes(p) ? f.paymentMethods.filter(x=>x!==p) : [...f.paymentMethods, p] }))} className={`mono text-xs px-2.5 py-1 rounded-full border ${runForm.paymentMethods.includes(p)?"bg-[var(--teal)] text-white border-[var(--teal)]":"bg-white border-[var(--line)]"}`}>{p}</button>
                    ))}
                  </div>
                </div>
                <button onClick={createRun} className="brass rounded-[10px] px-4 py-3 text-sm font-semibold">Announce run — “I’m going!” (COFFEE-15)</button>
                <p className="mono text-xs opacity-60">COFFEE-16 — colleagues see “leaves in {runForm.leaveIn} min”. COFFEE-34 — cap {settings.maxBeverageMode==="5"?"5 (tray)":settings.maxBeverageMode==="8"?"8 (2 trays)":"unlimited"} enforced.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="display text-lg">Active runs</h3>
                <span className="mono text-xs px-2 py-1 rounded-full bg-white border">{runs.length}</span>
              </div>
              {runs.length===0 ? <div className="iso-building p-6 mono text-sm">No runs yet. Announce one to collect orders.</div> : (
                <div className="grid gap-4">
                  {runs.map(r=>{
                    const shop = shops.find(s=>s.id===r.shopId);
                    const ros = orders.filter(o=>o.runId===r.id);
                    const totalCups = ros.reduce((a,o)=>a+o.items.reduce((s,it)=>s+it.quantity,0),0);
                    return (
                      <div key={r.id} className="iso-building p-4">
                        <div className="flex gap-3">
                          <div className="w-12 h-12 rounded-[12px] brass grid place-items-center text-lg">✦</div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm flex flex-wrap gap-2 items-center">
                              {r.runnerName} → {shop?.name ?? "—"} 
                              <span className={`mono text-[11px] px-2 py-0.5 rounded-full border ${r.status==="announcing"?"bg-amber-100 border-amber-200 text-amber-900":r.status==="collecting"?"bg-teal-50 border-teal-200 text-teal-900":r.status==="headingBack"?"bg-blue-50 border-blue-200 text-blue-900":"bg-stone-100"}`}>{r.status}</span>
                              <span className="mono text-xs opacity-60">leaves in {r.leaveInMinutes} min • {r.capacity} slots • {r.coRunnerAllowed? `+ co-runner ${r.coRunnerCapacity}`:"solo"}</span>
                            </div>
                            <div className="text-xs text-[var(--muted)]">{r.pickupLocation} {r.dropoff?"• dropoff to desks":"• pickup at lobby"} • {r.paymentMethods.join(" · ")} • {totalCups}/{r.capacity} cups claimed</div>
                            <div className="mono text-xs opacity-60">{new Date(r.createdAt).toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <button onClick={()=>updateRunStatus(r.id, "collecting")} className="mono text-xs px-3 py-1 rounded-full border bg-white hover:bg-[var(--cream)]">Collecting</button>
                          <button onClick={()=>updateRunStatus(r.id, "headingBack")} className="mono text-xs px-3 py-1 rounded-full bg-[var(--espresso)] text-white">Heading back — items in hand (COFFEE-24)</button>
                          <button onClick={()=>updateRunStatus(r.id, "delivered")} className="mono text-xs px-3 py-1 rounded-full border">Delivered</button>
                        </div>
                        {ros.length>0 && (
                          <div className="mt-3 grid gap-2">
                            {ros.map(o=>(
                              <div key={o.id} className="rounded-[10px] bg-white border px-3 py-2 flex gap-2 items-center text-sm">
                                <span className="flex-1 truncate">{o.delivereeName} • {o.items.length} items • {formatPrice(totalOrdersValue(o))} • {o.paymentMethod} {o.paidBack?"• paid back":"• owes"}</span>
                                <span className={`mono text-xs px-2 py-0.5 rounded-full border ${o.status==="cannotFill"?"bg-red-50 border-red-200 text-red-700":o.status==="accepted"?"bg-green-50 border-green-200 text-green-700":"bg-amber-50 border-amber-200"}`}>{o.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ORDERS */}
        {tab==="orders" && (
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6">
            <div className="iso-building p-5">
              <h2 className="display text-xl">Place an order as deliveree</h2>
              <p className="text-xs text-[var(--muted)]">COFFEE-20 → 23, 26, 32, 33 — payment, dropoff, contact, pledge</p>
              {runs.length===0 ? <div className="mono text-sm mt-4 p-4 bg-white border border-dashed rounded-[10px]">No runs announced yet. Create one in Runs tab.</div> : (
                <div className="mt-4 grid gap-3">
                  <select value={orderForm.runId} onChange={e=>setOrderForm({...orderForm,runId:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2.5 text-sm border-[var(--line)]">
                    {runs.map(r=>{
                      const shop = shops.find(s=>s.id===r.shopId);
                      return <option key={r.id} value={r.id}>{r.runnerName} — {shop?.name} — leaves in {r.leaveInMinutes} min — {r.paymentMethods.join("/")} </option>;
                    })}
                  </select>
                  {activeRun && (
                    <div className="rounded-[10px] bg-[var(--cream)] border p-3 mono text-xs">
                      Runner accepts: <b>{activeRun.paymentMethods.join(" · ")}</b> • Cap {activeRun.capacity} • {activeRun.pickupLocation} {activeRun.dropoff && "(dropoff available)"} — COFFEE-22 compatibility is checked before placement.
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-3">
                    <input placeholder="Your name" value={orderForm.delivereeName} onChange={e=>setOrderForm({...orderForm,delivereeName:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2.5 text-sm border-[var(--line)]" />
                    <input placeholder="Contact phone # for runner (COFFEE-32)" value={orderForm.contactPhone} onChange={e=>setOrderForm({...orderForm,contactPhone:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2.5 text-sm border-[var(--line)]" />
                  </div>
                  {activeRun?.dropoff && (
                    <input placeholder="Drop off location — Desk 3B, 2nd floor (COFFEE-26)" value={orderForm.dropOffLocation} onChange={e=>setOrderForm({...orderForm,dropOffLocation:e.target.value})} className="rounded-[10px] border bg-white px-3 py-2.5 text-sm border-[var(--line)]" />
                  )}
                  <div>
                    <div className="mono text-xs opacity-60 mb-1">Payment method you will use to pay back runner (COFFEE-20)</div>
                    <div className="flex flex-wrap gap-1.5">
                      {PAYMENT_OPTIONS.map(p=>{
                        const compatible = activeRun?.paymentMethods.includes(p);
                        return (
                          <button key={p} onClick={()=>setOrderForm({...orderForm,paymentMethod:p})} className={`mono text-xs px-2.5 py-1 rounded-full border ${orderForm.paymentMethod===p?"bg-[var(--teal)] text-white border-[var(--teal)]": compatible?"bg-white border-[var(--line)]":"bg-stone-100 border-stone-200 opacity-50"}`}>{p} {compatible?"✓":"✗"}</button>
                        );
                      })}
                    </div>
                    {orderForm.paymentMethod && activeRun && !activeRun.paymentMethods.includes(orderForm.paymentMethod) && (
                      <div className="mono text-xs mt-2 p-2 rounded bg-red-50 border border-red-200 text-red-700">Runner does not accept {orderForm.paymentMethod}. Pick a compatible method — order will be blocked (COFFEE-22).</div>
                    )}
                  </div>

                  <div className="border-t pt-3">
                    <h3 className="font-semibold text-sm">Pick menu items</h3>
                    <p className="mono text-xs opacity-60">COFFEE-31 — flagged items show warning. Cap {maxForRun} enforced (COFFEE-34/36).</p>
                    <div className="mt-3 grid gap-3 max-h-[420px] overflow-auto pr-1">
                      {activeRunMenuItems.map(it=>{
                        const sel = orderForm.selected[it.id] ?? { quantity:0, choices:{} };
                        const groups = optionGroups.filter(g=>g.itemId===it.id);
                        const flagged = it.flaggedCount>0;
                        return (
                          <div key={it.id} className={`rounded-[12px] border p-3 ${flagged?"bg-red-50 border-red-200":"bg-white border-[var(--line)]"}`}>
                            <div className="flex gap-3">
                              <IsoCup title={it.name} price={it.price} flagged={flagged} />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm">{it.name} <span className="font-normal text-xs">{formatPrice(it.price)}</span> {flagged && <span className="mono text-[11px] px-1.5 py-0.5 rounded bg-red-600 text-white">Flagged {it.flaggedCount}× — may be inaccurate (COFFEE-31)</span>}</div>
                                <div className="text-xs text-[var(--muted)]">{it.description}</div>
                                {flagged && <div className="text-xs text-red-700 mt-1">{it.flaggedReasons.slice(-1)[0]}</div>}
                                <div className="mt-2 flex items-center gap-2">
                                  <button onClick={()=>setOrderForm(f=>({ ...f, selected:{ ...f.selected, [it.id]:{ quantity: Math.max(0, (f.selected[it.id]?.quantity||0)-1), choices: f.selected[it.id]?.choices||{} } } }))} className="w-7 h-7 rounded-full border bg-white">−</button>
                                  <span className="mono text-sm w-6 text-center">{sel.quantity}</span>
                                  <button onClick={()=>{
                                    const nextQty = (sel.quantity||0)+1;
                                    if (totalBeveragesInOrder+1>maxForRun) { alert(`Cap reached: ${maxForRun} beverages max for this run.`); return;}
                                    setOrderForm(f=>({ ...f, selected:{ ...f.selected, [it.id]:{ quantity: nextQty, choices: f.selected[it.id]?.choices||{} } } }));
                                  }} className="w-7 h-7 rounded-full brass text-sm font-bold">+</button>
                                  <span className="mono text-xs opacity-60 ml-2">{totalBeveragesInOrder}/{maxForRun} in order</span>
                                </div>
                                {groups.length>0 && sel.quantity>0 && (
                                  <div className="mt-2 grid gap-1.5">
                                    {groups.map(g=>(
                                      <div key={g.id} className="rounded-[10px] bg-[var(--cream)] border p-2">
                                        <div className="mono text-xs font-medium">{g.name} {g.required && "(required)"} — {g.type}</div>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {g.choices.map(c=>{
                                            const chosen = (sel.choices[g.id]||[]).includes(c.id);
                                            return (
                                              <button key={c.id} onClick={()=>{
                                                setOrderForm(f=>{
                                                  const cur = f.selected[it.id]?.choices[g.id]||[];
                                                  let next: string[];
                                                  if (g.type==="single") next = chosen? [] : [c.id];
                                                  else next = chosen? cur.filter(x=>x!==c.id) : [...cur, c.id];
                                                  return { ...f, selected:{ ...f.selected, [it.id]:{ quantity: f.selected[it.id]?.quantity||0, choices:{ ...f.selected[it.id]?.choices, [g.id]: next } } } };
                                                });
                                              }} className={`mono text-xs px-2 py-1 rounded-full border ${chosen?"bg-[var(--teal)] text-white border-[var(--teal)]":"bg-white border-[var(--line)]"}`}>{c.label}{c.priceDelta?` +${formatPrice(c.priceDelta)}`:""}</button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <label className="flex gap-2 p-3 rounded-[10px] bg-[var(--paper)] border border-[var(--line)] text-sm">
                    <input type="checkbox" checked={orderForm.pledged} onChange={e=>setOrderForm({...orderForm,pledged:e.target.checked})} />
                    <span><b>Acknowledgement (COFFEE-33):</b> I pledge to pay back the runner via my selected method, and I will NOT contact the runner to change my order once placed. I understand the runner fronted the cost.</span>
                  </label>

                  <button disabled={!canPlaceOrder} onClick={placeOrder} className={`rounded-[10px] px-4 py-3 text-sm font-semibold ${canPlaceOrder?"brass":"bg-stone-200 text-stone-500 border border-stone-300"}`}>Place order — affirm compatibility & pledge</button>
                  {!canPlaceOrder && <div className="mono text-xs opacity-60">Fill name, phone, compatible payment, pick at least 1 item, pledge. {activeRun?.dropoff && !orderForm.dropOffLocation.trim() && "• dropoff location required"}</div>}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="iso-building p-4">
                <h3 className="font-semibold">Runner controls</h3>
                <p className="mono text-xs opacity-60">COFFEE-23 — mark “cannot fill” when item not available</p>
                <div className="mt-3 grid gap-2">
                  {orders.slice(0,6).map(o=>{
                    const run = runs.find(r=>r.id===o.runId);
                    return (
                      <div key={o.id} className="rounded-[10px] bg-white border p-3">
                        <div className="font-medium text-sm">{o.delivereeName} • {run?.runnerName}’s run • {o.contactPhone}</div>
                        <div className="text-xs text-[var(--muted)]">{o.items.map(oi=>{
                          const it = items.find(i=>i.id===oi.itemId);
                          return `${it?.name ?? "item"}×${oi.quantity}`;
                        }).join(" · ")} • {formatPrice(totalOrdersValue(o))} • {o.paymentMethod}</div>
                        <div className="mt-2 flex gap-1.5 flex-wrap">
                          <button onClick={()=>updateOrderStatus(o.id,"accepted")} className="mono text-xs px-2.5 py-1 rounded-full border bg-green-50 border-green-200">Accept</button>
                          <button onClick={()=>{
                            const r = prompt("Reason cannot be filled / option unavailable?");
                            updateOrderStatus(o.id,"cannotFill", r || "Item unavailable");
                          }} className="mono text-xs px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700">Cannot fill (COFFEE-23)</button>
                          <button onClick={()=>markPaidBack(o.id)} className={`mono text-xs px-2.5 py-1 rounded-full border ${o.paidBack?"bg-teal-50 border-teal-200 text-teal-800":"bg-white"}`}>{o.paidBack?"Paid back ✓":"Mark Paid Back (COFFEE-38)"}</button>
                        </div>
                        {o.status==="cannotFill" && <div className="mono text-xs mt-2 p-2 bg-red-50 border border-red-100 rounded">{o.cannotFillReason}</div>}
                        {o.paidBack && <div className="mono text-xs mt-1 text-teal-700">Marked paid back — even if transaction outside app.</div>}
                      </div>
                    );
                  })}
                  {orders.length===0 && <div className="mono text-xs p-3 bg-white border border-dashed rounded-[10px]">No orders yet.</div>}
                </div>
              </div>

              <div className="iso-building p-4">
                <h3 className="font-semibold">Contact list for runner</h3>
                <p className="mono text-xs opacity-60">COFFEE-32 — phone numbers to reach out if issue</p>
                <div className="mt-2 grid gap-1 mono text-xs">
                  {orders.map(o=>(
                    <div key={o.id} className="flex justify-between border-b py-1"><span>{o.delivereeName}</span><span className="font-medium">{o.contactPhone || "—"}</span><span>{o.dropOffLocation || "pickup"}</span></div>
                  ))}
                  {orders.length===0 && <div className="opacity-60">—</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BOARD */}
        {tab==="board" && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="iso-building p-4">
                <div className="mono text-xs opacity-60">TOTAL RUNS</div>
                <div className="text-2xl font-bold">{runs.length}</div>
                <div className="text-xs text-[var(--muted)]">Audit log — COFFEE-37</div>
              </div>
              <div className="iso-building p-4">
                <div className="mono text-xs opacity-60">TOTAL ORDERS</div>
                <div className="text-2xl font-bold">{orders.length}</div>
                <div className="text-xs text-[var(--muted)]">{orders.filter(o=>o.paidBack).length} paid back</div>
              </div>
              <div className="iso-building p-4">
                <div className="mono text-xs opacity-60">REVENUE FRONTED</div>
                <div className="text-2xl font-bold">{formatPrice(orders.reduce((a,o)=>a+totalOrdersValue(o),0))}</div>
                <div className="text-xs text-[var(--muted)]">Price tracked per COFFEE-37</div>
              </div>
            </div>

            <div className="iso-building p-5">
              <h3 className="display text-lg">Audit log — all coffee runs placed and received, especially price (COFFEE-37)</h3>
              <div className="mt-4 grid gap-2 max-h-[520px] overflow-auto pr-1">
                {orders.map(o=>{
                  const run = runs.find(r=>r.id===o.runId);
                  const shop = shops.find(s=>s.id===run?.shopId);
                  return (
                    <div key={o.id} className="rounded-[12px] bg-white border p-3 flex gap-3">
                      <IsoCup title={o.items.map(oi=>items.find(i=>i.id===oi.itemId)?.name).join(",") || "cup"} price={totalOrdersValue(o)} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{shop?.name ?? "—"} • {run?.runnerName} → {o.delivereeName} • {new Date(o.createdAt).toLocaleString()}</div>
                        <div className="text-xs text-[var(--muted)]">{o.items.map(oi=>{
                          const it = items.find(i=>i.id===oi.itemId);
                          return `${it?.name}×${oi.quantity}`;
                        }).join(" · ")} • {o.paymentMethod} • {o.paidBack?"paid back":"owes"} • {o.status} {o.cannotFillReason?`— ${o.cannotFillReason}`:""} {o.dropOffLocation?`• drop: ${o.dropOffLocation}`:""} • tel {o.contactPhone}</div>
                        <div className="mono text-xs mt-1">Value: {formatPrice(totalOrdersValue(o))} {run ? `• run pickup: ${run.pickupLocation}`:""}</div>
                      </div>
                    </div>
                  );
                })}
                {orders.length===0 && <div className="mono text-sm p-4 bg-white border border-dashed rounded-[10px]">No orders to audit yet.</div>}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="iso-building p-5">
                <h3 className="font-semibold">Menu item health</h3>
                <p className="mono text-xs opacity-60">COFFEE-30/31 — items flagged for adjusting or removal</p>
                <div className="mt-3 grid gap-2">
                  {items.filter(it=>it.flaggedCount>0).map(it=>(
                    <div key={it.id} className="rounded-[10px] bg-red-50 border border-red-200 p-3">
                      <div className="font-medium text-sm">{it.name} — {it.flaggedCount} flags</div>
                      <div className="text-xs">{it.flaggedReasons.join(" · ")}</div>
                    </div>
                  ))}
                  {items.filter(it=>it.flaggedCount>0).length===0 && <div className="mono text-xs p-3 bg-white border border-dashed rounded-[10px]">No flagged items. Use Flag on Menus tab.</div>}
                </div>
              </div>
              <div className="iso-building p-5">
                <h3 className="font-semibold">Beverage cap & A/B</h3>
                <p className="mono text-xs opacity-60">COFFEE-34/36 — 5 vs 8 vs unlimited • COFFEE-35 AI cup per item</p>
                <div className="mt-3 mono text-sm p-3 bg-[var(--cream)] border rounded-[10px]">Current: <b>{settings.maxBeverageMode}</b> (group {settings.abGroup}). Each order enforces max. Isometric cups above are generated from title/description/options — mock AI.</div>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {tab==="settings" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="iso-building p-5">
              <h2 className="display text-xl">Runner defaults</h2>
              <p className="mono text-xs opacity-60">COFFEE-27 — universal pickup, plus per-run override (COFFEE-25)</p>
              <div className="mt-4 grid gap-3">
                <label className="text-sm">Default pickup location
                  <input value={settings.defaultPickup} onChange={e=>setSettings({...settings,defaultPickup:e.target.value})} className="mt-1 w-full rounded-[10px] border bg-white px-3 py-2 text-sm border-[var(--line)]" />
                </label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.defaultDropoff} onChange={e=>setSettings({...settings,defaultDropoff:e.target.checked})} /> By default I drop off to desks</label>
                <div>
                  <div className="mono text-xs opacity-60 mb-1">Default payment methods I accept</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PAYMENT_OPTIONS.map(p=>(
                      <button key={p} onClick={()=>setSettings(s=>({ ...s, paymentMethods: s.paymentMethods.includes(p) ? s.paymentMethods.filter(x=>x!==p) : [...s.paymentMethods,p] }))} className={`mono text-xs px-2.5 py-1 rounded-full border ${settings.paymentMethods.includes(p)?"bg-[var(--teal)] text-white border-[var(--teal)]":"bg-white border-[var(--line)]"}`}>{p}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t pt-4">
                <h3 className="font-semibold">Beverage caps & experiments</h3>
                <p className="mono text-xs opacity-60">COFFEE-34 — 5 max (tray), COFFEE-36 — A/B 8 vs unlimited</p>
                <div className="mt-3 grid gap-2">
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="cap" checked={settings.maxBeverageMode==="5"} onChange={()=>setSettings({...settings,maxBeverageMode:"5",abGroup:"A"})} /> 5 beverages — 1 single + 1 tray (default, designer intent)</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="cap" checked={settings.maxBeverageMode==="8"} onChange={()=>setSettings({...settings,maxBeverageMode:"8",abGroup:"B"})} /> 8 beverages — 2 trays (experiment group B)</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="cap" checked={settings.maxBeverageMode==="unlimited"} onChange={()=>setSettings({...settings,maxBeverageMode:"unlimited",abGroup:"B"})} /> Unlimited (experiment — control)</label>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="iso-building p-5">
                <h3 className="font-semibold">Social logins</h3>
                <p className="mono text-xs opacity-60">COFFEE-29 — Google (live), Apple, Facebook, Github, Amazon</p>
                {authUser ? (
                  <div className="mt-4 rounded-[12px] border border-[var(--line)] bg-[var(--teal-light)] p-4 flex items-center gap-3">
                    {authUser.picture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={authUser.picture} alt={authUser.name} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow" />
                    ) : (
                      <div className="w-12 h-12 rounded-full brass grid place-items-center font-bold text-[#1e120a]">{authUser.name.slice(0,1).toUpperCase()}</div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{authUser.name}</div>
                      <div className="mono text-xs opacity-60 truncate">{authUser.email}</div>
                      <div className="mono text-[10px] tracking-widest mt-1 px-2 py-0.5 rounded-full bg-white border inline-block">{authUser.provider === "google" ? "Google · verified" : "Demo · no OAuth"}</div>
                    </div>
                    <button onClick={signOut} className="ml-auto mono text-xs px-3 py-1.5 rounded-full border bg-white hover:bg-[var(--paper)]">Sign out</button>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-[10px] border bg-white p-3">
                      <div className="flex items-center gap-2 text-sm font-medium mb-2">
                        <span className="w-6 h-6 rounded-full bg-[#DB4437] grid place-items-center text-[11px] font-bold text-white">G</span>
                        Continue with Google
                        <span className="ml-auto mono text-[10px] px-2 py-1 rounded-full bg-[var(--cream)] border">{GOOGLE_CLIENT_ID ? "OAuth ready" : "Demo mode"}</span>
                      </div>
                      {GOOGLE_CLIENT_ID ? (
                        <div ref={googleSettingsBtnRef} className="min-h-[44px] flex items-center justify-center" />
                      ) : (
                        <button onClick={demoGoogleLogin} className="w-full rounded-[10px] border bg-white px-4 py-2.5 text-sm font-medium flex items-center justify-between hover:bg-[var(--cream)]">
                          <span className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#DB4437] grid place-items-center text-[10px] font-bold text-white">G</span> Continue with Google</span><span className="mono text-xs opacity-60">→ demo</span>
                        </button>
                      )}
                      <div className="mono text-[11px] opacity-60 mt-2 leading-relaxed">
                        {GOOGLE_CLIENT_ID ? "Uses Google Identity Services — verified Google ID token, no password. Sign-out disables auto-select." : "No NEXT_PUBLIC_GOOGLE_CLIENT_ID set — using demo login for preview. Add your OAuth Client ID in Vercel env to enable real Google verification."}
                      </div>
                    </div>
                    {[
                      ["Apple ID","bg-black text-white"],
                      ["Facebook","bg-[#1877F2] text-white"],
                      ["Github","bg-[#24292f] text-white"],
                      ["Amazon","bg-[#FF9900] text-[#111]"],
                    ].map(([label,cls])=>(
                      <button key={label} onClick={()=>alert(`${label} login — stubbed for COFFEE-29. Would OAuth here.`)} className={`rounded-[10px] px-4 py-2.5 text-sm font-medium border flex items-center justify-between opacity-90 hover:opacity-100 ${cls}`}>
                        <span>Continue with {label}</span><span className="mono text-xs opacity-70">→</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mono text-xs mt-3 p-3 bg-[var(--cream)] border rounded-[10px] leading-relaxed">
                  Google is live via GIS. Set <span className="font-bold">NEXT_PUBLIC_GOOGLE_CLIENT_ID</span> to your Google Cloud OAuth 2.0 Web Client ID (authorized origin = your Vercel URL). Other providers remain stubs — wire to Auth.js/NextAuth when ready.
                </div>
              </div>

              <div className="iso-building p-5">
                <h3 className="font-semibold">How to test quickly</h3>
                <ul className="mono text-xs mt-2 grid gap-1 opacity-70 list-disc pl-4">
                  <li>Shops → add shop → Menus → add menu → add section → add item → add options + universal options → apply to item</li>
                  <li>Runs → announce a run (set capacity, leave in, co-runner, pickup, payments)</li>
                  <li>Order → pick run, enter phone + dropoff + compatible payment + pledge → place</li>
                  <li>Board → see audit, flag health, runner can mark cannotFill / headingBack / paidBack</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[1240px] px-4 pb-8">
        <div className="iso-building p-4 flex flex-wrap gap-3 items-center justify-between mono text-xs">
          <span className="opacity-60">CoffeeRun • isometric office caravan • {shops.length} shops • {items.length} items • {runs.length} runs • persisted in localStorage</span>
          <span className="opacity-60">COFFEE-9 → 38 covered • no backend • deploy to Vercel preview for UAT</span>
        </div>
      </footer>
    </div>
  );
}
