import{s as m}from"./supabase-client-ngkqdeIq.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";const k=new URLSearchParams(window.location.search),u=k.get("cashier_id");u?_():(f("Kasiyer ID'si bulunamadı. Lütfen giriş sayfasından tekrar deneyin."),document.getElementById("loading").style.display="none");async function _(){try{const{data:e,error:t}=await m.from("cashiers").select("*").eq("id",u).single();if(t)throw t;const{data:a,error:r}=await m.from("weekly_performance").select("*").order("total_points",{ascending:!1});if(r)throw r;const{data:i,error:n}=await m.from("entry_history").select("*").eq("cashier_id",u).order("entry_time",{ascending:!1}).limit(10);if(n)throw n;E(e,a,i),await b(u),document.getElementById("loading").style.display="none",document.getElementById("dashboard").style.display="block"}catch(e){console.error("Dashboard yükleme hatası:",e),f("Dashboard yüklenirken bir hata oluştu: "+e.message),document.getElementById("loading").style.display="none"}}function E(e,t,a){const r={"Tuba Bozaklı":"av-t","Elif Yıldırım":"av-e","Melda Yılmaz":"av-m","Ceren Erdem":"av-c"},i=e.name.split(" ").map(y=>y[0]).join("");document.getElementById("profileAvatar").textContent=i,document.getElementById("profileAvatar").className="avatar "+(r[e.name]||"av-t"),document.getElementById("profileName").textContent=e.name,document.getElementById("profileRole").textContent=`Kasiyer - ${e.role||"Cafetarya"}`;const n=e.total_points||0;document.getElementById("totalPoints").textContent=n;const d=x(n);document.getElementById("badgeIcon").textContent=d.icon,document.getElementById("badgeLabel").textContent=d.label;const s=$(n);document.getElementById("nextBadge").textContent=s.label;const o=s.threshold-n;document.getElementById("pointsNeeded").textContent=o>0?`${o} puan kaldı`:"Tamamlandı!";const l=s.threshold>0?Math.min(n/s.threshold*100,100):100;document.getElementById("progressFill").style.width=l+"%";const c=t.find(y=>y.cashier_id===e.id)||{};document.getElementById("statEntries").textContent=c.total_entries||0,document.getElementById("statOnTime").textContent=c.on_time_entries||0;const v=c.total_revenue||0;document.getElementById("statRevenue").textContent=g(v),w(t.slice(0,4),e.id),z(a)}function x(e){return e>=500?{icon:"💎",label:"Elmas"}:e>=300?{icon:"🥇",label:"Altın"}:e>=150?{icon:"🥈",label:"Gümüş"}:e>=50?{icon:"🥉",label:"Bronz"}:{icon:"🌱",label:"Yeni Başlayan"}}function $(e){return e>=500?{label:"Maksimum Seviye",threshold:500}:e>=300?{label:"Elmas",threshold:500}:e>=150?{label:"Altın",threshold:300}:e>=50?{label:"Gümüş",threshold:150}:{label:"Bronz",threshold:50}}function w(e,t){const a=document.getElementById("leaderboard");a.innerHTML="";const r={"Tuba Bozaklı":"av-t","Elif Yıldırım":"av-e","Melda Yılmaz":"av-m","Ceren Erdem":"av-c"};e.forEach((i,n)=>{const d=n+1,s=i.cashier_id===t,o=i.cashier_name?i.cashier_name.split(" ").map(c=>c[0]).join(""):"??",l=document.createElement("div");l.className="leaderboard-item"+(s?" current":""),l.innerHTML=`
                    <div class="rank rank-${d}">#${d}</div>
                    <div class="leaderboard-avatar ${r[i.cashier_name]||"av-t"}">${o}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${i.cashier_name||"Bilinmiyor"}${s?" (Sen)":""}</div>
                        <div class="leaderboard-stats">${i.total_entries||0} giriş • ${i.on_time_entries||0} zamanında</div>
                    </div>
                    <div class="leaderboard-points">⭐ ${i.total_points||0}</div>
                `,a.appendChild(l)})}function z(e){const t=document.getElementById("historyBody");if(t.innerHTML="",e.length===0){t.innerHTML='<tr><td colspan="5" style="text-align: center; color: var(--txt2); padding: 40px">Henüz giriş kaydı yok</td></tr>';return}e.forEach(a=>{const r=document.createElement("tr"),i=new Date(a.entry_time),n=i.toLocaleDateString("tr-TR",{day:"2-digit",month:"short",year:"numeric"}),d=i.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}),s=a.shift==="sabah"?"Sabah":"Akşam",o=a.shift==="sabah"?"shift-sabah":"shift-aksam",l=a.is_on_time?"✅":"⚠️",c=a.is_on_time?"Zamanında":"Geç",v=a.is_on_time?"status-ontime":"status-late";r.innerHTML=`
                    <td>
                        <div style="font-weight: 600">${n}</div>
                        <div style="font-size: 12px; color: var(--txt2)">${d}</div>
                    </td>
                    <td><span class="shift-badge ${o}">${s}</span></td>
                    <td><span class="status-badge ${v}">${l} ${c}</span></td>
                    <td class="mono">${g(a.revenue_amount||0)}</td>
                    <td class="mono" style="color: var(--gold)">+${a.points_earned||0}</td>
                `,t.appendChild(r)})}function g(e){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(e)+"₺"}function f(e){const t=document.getElementById("error");t.textContent="❌ "+e,t.style.display="block"}function p(e,t="success"){const a=document.createElement("div");a.style.cssText=`
                position:fixed;top:20px;right:20px;padding:14px 20px;border-radius:10px;
                font-weight:600;font-size:14px;z-index:9999;
                background:${t==="success"?"#064e3b":"#7f1d1d"};
                color:${t==="success"?"#6ee7b7":"#fca5a5"};
                border:1px solid ${t==="success"?"#065f46":"#991b1b"};
                box-shadow:0 8px 25px rgba(0,0,0,.3);
            `,a.textContent=e,document.body.appendChild(a),setTimeout(()=>a.remove(),3e3)}function B(e){return new Date(e+"T00:00:00").toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"})}async function b(e){try{const t=new Date().toISOString().split("T")[0],a=new Date;a.setDate(a.getDate()-7);const r=a.toISOString().split("T")[0],{data:i,error:n}=await m.from("daily_reports").select("*").eq("cashier_id",e).gte("date",r).order("date",{ascending:!1}).order("entry_time",{ascending:!1});if(n)throw n;const d=i.filter(o=>o.date===t),s=i.filter(o=>o.date!==t);C(d,s)}catch(t){console.error("Girişleri çekme hatası:",t)}}function C(e,t){const a=document.getElementById("todayEntriesContainer"),r=document.getElementById("pastEntriesContainer");a.innerHTML=e.length===0?`<div style="text-align:center;padding:20px;color:var(--txt2);">
                       <div style="font-size:48px;margin-bottom:8px;">📭</div>
                       <div>Bugün henüz giriş yapmadınız</div>
                   </div>`:e.map(i=>h(i,!0)).join(""),r.innerHTML=t.length===0?`<div style="text-align:center;padding:20px;color:var(--txt2);">
                       <div style="font-size:48px;margin-bottom:8px;">📂</div>
                       <div>Geçmiş giriş bulunamadı</div>
                   </div>`:t.map(i=>h(i,!1)).join("")}function h(e,t){const a={restoran:"🍽️ Restoran",cafetarya:"☕ Cafetarya"}[e.kasa]||e.kasa,r={sabah:"🌅 Sabah",aksam:"🌙 Akşam"}[e.shift]||e.shift,i=(parseFloat(e.rumeli_z1)||0)+(parseFloat(e.rumeli_z2)||0)+(parseFloat(e.balik_ekmek)||0)+(parseFloat(e.dondurma)||0),n=new Date(e.entry_time).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}),d=t?`<div class="entry-actions">
                       <button class="entry-btn edit"   onclick="editMyEntry('${e.id}')">✏️ Düzenle</button>
                       <button class="entry-btn delete" onclick="deleteMyEntry('${e.id}')">🗑️ Sil</button>
                   </div>`:`<div style="text-align:center;font-size:11px;color:var(--txt3);padding:8px;">
                       Geçmiş girişler düzenlenemez
                   </div>`;return`
                <div class="entry-card" data-entry-id="${e.id}">
                    <div class="entry-header">
                        <div>
                            <div style="font-weight:700;margin-bottom:4px;">${B(e.date)}</div>
                            <div class="entry-time">⏰ ${n}</div>
                        </div>
                        <span class="entry-badge ${e.is_on_time?"on-time":"late"}">
                            ${e.is_on_time?"✅ Zamanında":"⚠️ Geç"}
                        </span>
                    </div>
                    <div class="entry-details">
                        <div class="entry-detail">
                            <div class="entry-detail-label">Kasa</div>
                            <div class="entry-detail-value">${a}</div>
                        </div>
                        <div class="entry-detail">
                            <div class="entry-detail-label">Vardiya</div>
                            <div class="entry-detail-value">${r}</div>
                        </div>
                        <div class="entry-detail">
                            <div class="entry-detail-label">Z Ciro</div>
                            <div class="entry-detail-value">${g(i)}</div>
                        </div>
                        <div class="entry-detail">
                            <div class="entry-detail-label">Puan</div>
                            <div class="entry-detail-value" style="color:var(--orange);">+${e.points_earned}</div>
                        </div>
                    </div>
                    ${d}
                </div>`}window.editMyEntry=async function(e){try{const{data:t,error:a}=await m.from("daily_reports").select("*").eq("id",e).single();if(a)throw a;const r=[{id:"editRumeliZ1",db:"rumeli_z1",label:"Rumeli Z1 (Cafetarya)"},{id:"editRumeliZ2",db:"rumeli_z2",label:"Rumeli Z2 (Restoran)"},{id:"editBalikEkmek",db:"balik_ekmek",label:"Balık Ekmek"},{id:"editDondurma",db:"dondurma",label:"Dondurma"}].filter(o=>t[o.db]!==null&&t[o.db]!==0),i={gida:"Gıda",kahvalti:"Kahvaltı",kahve:"Kahve",meyvesuyu:"Meyve Suyu",sicak_icecek:"Sıcak İçecek",soguk_icecek:"Soğuk İçecek",tatli:"Tatlı",salata:"Salata",dondurma_kategori:"Dondurma (Kategori)"},n=Object.keys(i).filter(o=>t[o]!==null&&t[o]!==0).map(o=>({id:"editCat_"+o,db:o,label:i[o]})),d=o=>o.map(l=>`
                    <div class="edit-field">
                        <label>${l.label}</label>
                        <input type="number" id="${l.id}" value="${t[l.db]}" step="0.01">
                    </div>`).join(""),s=document.createElement("div");s.className="edit-modal-overlay",s.innerHTML=`
                    <div class="edit-modal-box">
                        <div class="edit-modal-header">
                            <h2>✏️ Girişi Düzenle</h2>
                            <button onclick="this.closest('.edit-modal-overlay').remove()" class="close-btn">✕</button>
                        </div>
                        <div class="edit-modal-content">
                            <div class="edit-info-card">
                                <strong>ℹ️ Önemli:</strong> Sadece bugün girdiğiniz verileri düzenleyebilirsiniz.
                                Z raporu ve kategori değerlerini dikkatli kontrol edin.
                            </div>
                            ${r.length>0?`
                            <div class="edit-section">
                                <h3>💰 Z Raporu Değerleri</h3>
                                <div class="edit-grid">${d(r)}</div>
                            </div>`:""}
                            ${n.length>0?`
                            <div class="edit-section">
                                <h3>🍽️ Kategori Satışları</h3>
                                <div class="edit-grid">${d(n)}</div>
                            </div>`:""}
                        </div>
                        <div class="edit-modal-actions">
                            <button onclick="this.closest('.edit-modal-overlay').remove()" class="modal-btn cancel">İptal</button>
                            <button onclick="confirmEditMyEntry('${e}')" class="modal-btn save">💾 Kaydet</button>
                        </div>
                    </div>`,document.body.appendChild(s)}catch(t){console.error("Düzenleme modal hatası:",t),alert("❌ Giriş yüklenemedi: "+t.message)}};window.confirmEditMyEntry=async function(e){try{const t={};Object.entries({editRumeliZ1:"rumeli_z1",editRumeliZ2:"rumeli_z2",editBalikEkmek:"balik_ekmek",editDondurma:"dondurma"}).forEach(([n,d])=>{const s=document.getElementById(n);s&&(t[d]=parseFloat(s.value)||0)}),["gida","kahvalti","kahve","meyvesuyu","sicak_icecek","soguk_icecek","tatli","salata","dondurma_kategori"].forEach(n=>{const d=document.getElementById("editCat_"+n);d&&(t[n]=parseFloat(d.value)||0)}),t.total_revenue=(t.rumeli_z1||0)+(t.rumeli_z2||0)+(t.balik_ekmek||0)+(t.dondurma||0);const{error:i}=await m.from("daily_reports").update(t).eq("id",e);if(i)throw i;document.querySelector(".edit-modal-overlay").remove(),p("✅ Giriş başarıyla güncellendi!","success"),await b(u)}catch(t){console.error("Güncelleme hatası:",t),alert("❌ Güncelleme başarısız: "+t.message)}};window.deleteMyEntry=async function(e){if(confirm(`⚠️ Bu girişi silmek istediğinize emin misiniz?

Bu işlem geri alınamaz!`))try{const{error:t}=await m.from("daily_reports").delete().eq("id",e);if(t)throw t;p("✅ Giriş silindi!","success"),await b(u)}catch(t){console.error("Silme hatası:",t),alert("❌ Silme başarısız: "+t.message)}};
