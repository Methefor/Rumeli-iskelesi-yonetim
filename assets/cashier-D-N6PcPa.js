import"./modulepreload-polyfill-B5Qt9EMX.js";import{supabase as g,uploadCashierAvatar as S,updateShiftEntry as D}from"./supabase-client-_4kS_E--.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";typeof window._cashierLoadOk=="function"&&window._cashierLoadOk();const M=new URLSearchParams(window.location.search),f=M.get("cashier_id");let _=null;f?T():(I("Kasiyer ID'si bulunamadı. Lütfen giriş sayfasından tekrar deneyin."),document.getElementById("loading").style.display="none");function h(e){return e.getFullYear()+"-"+String(e.getMonth()+1).padStart(2,"0")+"-"+String(e.getDate()).padStart(2,"0")}async function T(){try{const e=new Date,t=h(new Date(e.getFullYear(),e.getMonth(),1)),a=h(new Date(e.getFullYear(),e.getMonth()+1,0)),[l,n,o,r]=await Promise.all([g.from("cashiers").select("*").eq("id",f).single(),g.from("daily_reports").select("*").eq("cashier_id",f).gte("date",t).lte("date",a),g.from("daily_reports").select("cashier_id, points_earned, is_on_time, rumeli_z1, total_revenue, cashiers(name)").gte("date",t).lte("date",a),g.from("entry_history").select("*").eq("cashier_id",f).order("entry_time",{ascending:!1}).limit(10)]);if(l.error)throw l.error;const d=l.data,i=n.data||[],c=o.data||[],u=r.data||[],v=i.reduce((s,m)=>s+(parseInt(m.points_earned)||0),0),y=i.length,z={entries:y,onTime:i.filter(s=>s.is_on_time).length,revenue:i.reduce((s,m)=>s+(parseFloat(m.individual_revenue)||0),0),points:v,performancePct:y>0?Math.round(v/(y*100)*100):0},p={};c.forEach(s=>{var x;const m=s.cashier_id,$=((x=s.cashiers)==null?void 0:x.name)||"Bilinmiyor";p[m]||(p[m]={cashier_id:m,cashier_name:$,total_score:0,total_entries:0,on_time_entries:0});const C=(s.is_on_time?50:0)+(parseFloat(s.rumeli_z1||0)>0||parseFloat(s.total_revenue||0)>0?50:0);p[m].total_score+=C,p[m].total_entries+=1,s.is_on_time&&(p[m].on_time_entries+=1)});const B=Object.values(p).map(s=>({...s,performance_pct:s.total_entries>0?Math.round(s.total_score/(s.total_entries*100)*100):0})).sort((s,m)=>m.performance_pct!==s.performance_pct?m.performance_pct-s.performance_pct:m.total_entries-s.total_entries);L(d,z,B,u),await E(f),document.getElementById("loading").style.display="none",document.getElementById("dashboard").style.display="block"}catch(e){console.error("Dashboard yükleme hatası:",e),I("Dashboard yüklenirken bir hata oluştu: "+e.message),document.getElementById("loading").style.display="none"}}function L(e,t,a,l){var u;_=e.id;const n={"Tuba Bozaklı":"av-t","Elif Yıldırım":"av-e","Melda Yılmaz":"av-m","Ceren Erdem":"av-c"},o=document.getElementById("profileAvatar");if(e.avatar_url)o.innerHTML=`<img src="${e.avatar_url}" alt="${e.name}">`,o.className="avatar",o.style.background="#1e3a5f";else{const v=e.name.split(" ").map(y=>y[0]).join("");o.innerHTML=v,o.className="avatar "+(n[e.name]||"av-t"),o.style.background=""}document.getElementById("profileName").textContent=e.name,document.getElementById("profileRole").textContent="Kasiyer — Rumeli İskelesi";const r=t.performancePct,d=R(e.badge_level,r);document.getElementById("badgeIcon").textContent=d.icon,document.getElementById("badgeLabel").textContent=d.label,document.getElementById("totalPoints").textContent=t.entries>0?`%${r}`:"—",document.querySelector('[style*="puan"]')&&((u=document.querySelector('[style*="color: var(--txt2)"]'))==null?void 0:u.textContent)===" puan"&&(document.querySelector('[style*="color: var(--txt2)"]').textContent=" performans");const i=F(r,e.badge_level);document.getElementById("nextBadge").textContent=i.label,document.getElementById("pointsNeeded").textContent=i.pctLeft>0?`%${i.pctLeft} daha`:"Tamamlandı!",document.getElementById("progressFill").style.width=Math.min(r,100)+"%",document.getElementById("statEntries").textContent=t.entries,document.getElementById("statOnTime").textContent=t.onTime,document.getElementById("statRevenue").textContent=k(t.revenue);const c=document.querySelectorAll(".stat-label");c[0]&&(c[0].textContent="Bu Ay Giriş"),A(a.slice(0,4),f),K(l)}function R(e,t){const a={ozel_yildiz:{icon:"🌟",label:"Yılın Yıldızı"},ozel_ates:{icon:"🔥",label:"Ateş Çıkışlı"},ozel_roket:{icon:"🚀",label:"Hızlı Yükseliş"},ozel_onur:{icon:"🏅",label:"Onur Madalyası"},ozel_takim:{icon:"🤝",label:"Takım Ruhu"}};return e&&a[e]?a[e]:t>=95?{icon:"🦈",label:"Efsane Kaptan"}:t>=85?{icon:"🌊",label:"Deniz Kurdu"}:t>=75?{icon:"🏛️",label:"İskele Reisi"}:t>=65?{icon:"⛵",label:"Kıdemli Kaptan"}:t>=50?{icon:"🧭",label:"Lostromo"}:t>=30?{icon:"🪢",label:"Güverte Tayfası"}:{icon:"⚓",label:"Stajyer Tayfa"}}function F(e,t){return t!=null&&t.startsWith("ozel_")?{label:"Özel Rozet (Müdür)",pctLeft:0}:e>=95?{label:"Maksimum Seviye — Tam Deniz Kurdu!",pctLeft:0}:e>=85?{label:"Efsane Kaptan 🦈",pctLeft:95-e}:e>=75?{label:"Deniz Kurdu 🌊",pctLeft:85-e}:e>=65?{label:"İskele Reisi 🏛️",pctLeft:75-e}:e>=50?{label:"Kıdemli Kaptan ⛵",pctLeft:65-e}:e>=30?{label:"Lostromo 🧭",pctLeft:50-e}:{label:"Güverte Tayfası 🪢",pctLeft:30-e}}function A(e,t){const a=document.getElementById("leaderboard");a.innerHTML="";const l={"Tuba Bozaklı":"av-t","Elif Yıldırım":"av-e","Melda Yılmaz":"av-m","Ceren Erdem":"av-c"};e.forEach((n,o)=>{const r=o+1,d=n.cashier_id===t,i=n.cashier_name?n.cashier_name.split(" ").map(y=>y[0]).join(""):"??",c=n.performance_pct??0,u=c>=85?"var(--green)":c>=65?"var(--orange)":"var(--txt2)",v=document.createElement("div");v.className="leaderboard-item"+(d?" current":""),v.innerHTML=`
                    <div class="rank rank-${r}">#${r}</div>
                    <div class="leaderboard-avatar ${l[n.cashier_name]||"av-t"}">${i}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${n.cashier_name||"Bilinmiyor"}${d?" (Sen)":""}</div>
                        <div class="leaderboard-stats">
                            ${n.total_entries||0} giriş
                            · ${n.on_time_entries||0} zamanında
                        </div>
                    </div>
                    <div class="leaderboard-points" style="color:${u}">%${c}</div>
                `,a.appendChild(v)})}function K(e){const t=document.getElementById("historyBody");if(t.innerHTML="",e.length===0){t.innerHTML='<tr><td colspan="5" style="text-align: center; color: var(--txt2); padding: 40px">Henüz giriş kaydı yok</td></tr>';return}e.forEach(a=>{const l=document.createElement("tr"),n=new Date(a.entry_time),o=n.toLocaleDateString("tr-TR",{day:"2-digit",month:"short",year:"numeric",timeZone:"Europe/Istanbul"}),r=n.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}),d=a.shift==="sabah"?"Sabah":"Akşam",i=a.shift==="sabah"?"shift-sabah":"shift-aksam",c=a.is_on_time?"✅":"⚠️",u=a.is_on_time?"Zamanında":"Geç",v=a.is_on_time?"status-ontime":"status-late";l.innerHTML=`
                    <td>
                        <div style="font-weight: 600">${o}</div>
                        <div style="font-size: 12px; color: var(--txt2)">${r}</div>
                    </td>
                    <td><span class="shift-badge ${i}">${d}</span></td>
                    <td><span class="status-badge ${v}">${c} ${u}</span></td>
                    <td class="mono">${k(a.revenue_amount||0)}</td>
                    <td class="mono" style="color: var(--gold)">+${a.points_earned||0}</td>
                `,t.appendChild(l)})}function k(e){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(e)+"₺"}function I(e){const t=document.getElementById("error");t.textContent="❌ "+e,t.style.display="block"}window.triggerAvatarUpload=function(){document.getElementById("avatarFileInput").click()};window.handleAvatarUpload=async function(e){const t=e.files[0];if(!t||!_)return;if(t.size>4*1024*1024){b("Dosya en fazla 4 MB olabilir.","error"),e.value="";return}const a=document.querySelector(".avatar-wrapper"),l=document.querySelector(".avatar-upload-overlay");a.classList.add("avatar-uploading"),l.textContent="";const{url:n,error:o}=await S(_,t);if(a.classList.remove("avatar-uploading"),e.value="",o){b("⚠️ Yükleme hatası: "+(o.message||o),"error");return}const r=document.getElementById("profileAvatar");r.innerHTML=`<img src="${n}" alt="Profil">`,r.className="avatar",r.style.background="#1e3a5f",b("📷 Profil fotoğrafı güncellendi!","success")};function b(e,t="success"){const a=document.createElement("div");a.style.cssText=`
                position:fixed;top:20px;right:20px;padding:14px 20px;border-radius:10px;
                font-weight:600;font-size:14px;z-index:9999;
                background:${t==="success"?"#064e3b":"#7f1d1d"};
                color:${t==="success"?"#6ee7b7":"#fca5a5"};
                border:1px solid ${t==="success"?"#065f46":"#991b1b"};
                box-shadow:0 8px 25px rgba(0,0,0,.3);
            `,a.textContent=e,document.body.appendChild(a),setTimeout(()=>a.remove(),3e3)}function G(e){return new Date(e+"T00:00:00").toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"})}async function E(e){try{const t=h(new Date),a=new Date;a.setDate(a.getDate()-7);const l=h(a),{data:n,error:o}=await g.from("daily_reports").select("*").eq("cashier_id",e).gte("date",l).order("date",{ascending:!1}).order("entry_time",{ascending:!1});if(o)throw o;const r=n.filter(i=>i.date===t),d=n.filter(i=>i.date!==t);H(r,d)}catch(t){console.error("Girişleri çekme hatası:",t)}}function H(e,t){const a=document.getElementById("todayEntriesContainer"),l=document.getElementById("pastEntriesContainer");a.innerHTML=e.length===0?`<div style="text-align:center;padding:20px;color:var(--txt2);">
                       <div style="font-size:48px;margin-bottom:8px;">📭</div>
                       <div>Bugün henüz giriş yapmadınız</div>
                   </div>`:e.map(n=>w(n,!0)).join(""),l.innerHTML=t.length===0?`<div style="text-align:center;padding:20px;color:var(--txt2);">
                       <div style="font-size:48px;margin-bottom:8px;">📂</div>
                       <div>Geçmiş giriş bulunamadı</div>
                   </div>`:t.map(n=>w(n,!1)).join("")}function w(e,t){const a={restoran:"🍽️ Restoran",cafetarya:"☕ Cafetarya"}[e.kasa]||e.kasa,l={sabah:"🌅 Sabah",aksam:"🌙 Akşam",ogle:"🌙 Öğle"}[e.shift]||e.shift,n=parseFloat(e.individual_revenue)||(parseFloat(e.rumeli_z1)||0)+(parseFloat(e.rumeli_z2)||0)+(parseFloat(e.balik_ekmek)||0)+(parseFloat(e.dondurma)||0),o=new Date(e.entry_time).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}),r=t?`<div class="entry-actions">
                       <button class="entry-btn edit"   onclick="editMyEntry('${e.id}')">✏️ Düzenle</button>
                       <button class="entry-btn delete" onclick="deleteMyEntry('${e.id}')">🗑️ Sil</button>
                   </div>`:`<div style="text-align:center;font-size:11px;color:var(--txt3);padding:8px;">
                       Geçmiş girişler düzenlenemez
                   </div>`;return`
                <div class="entry-card" data-entry-id="${e.id}">
                    <div class="entry-header">
                        <div>
                            <div style="font-weight:700;margin-bottom:4px;">${G(e.date)}</div>
                            <div class="entry-time">⏰ ${o}</div>
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
                            <div class="entry-detail-value">${l}</div>
                        </div>
                        <div class="entry-detail">
                            <div class="entry-detail-label">Vardiya Cirosu</div>
                            <div class="entry-detail-value">${k(n)}</div>
                        </div>
                        <div class="entry-detail">
                            <div class="entry-detail-label">Puan</div>
                            <div class="entry-detail-value" style="color:var(--orange);">+${e.points_earned}</div>
                        </div>
                    </div>
                    ${r}
                </div>`}window.editMyEntry=async function(e){try{const{data:t,error:a}=await g.from("daily_reports").select("*").eq("id",e).single();if(a)throw a;const l=[{id:"editRumeliZ1",db:"rumeli_z1",label:"Rumeli Z1 (Cafetarya)"},{id:"editRumeliZ2",db:"rumeli_z2",label:"Rumeli Z2 (Restoran)"},{id:"editBalikEkmek",db:"balik_ekmek",label:"Balık Ekmek"},{id:"editDondurma",db:"dondurma",label:"Dondurma"}].filter(i=>t[i.db]!==null&&t[i.db]!==0),n={gida:"Gıda",kahvalti:"Kahvaltı",kahve:"Kahve",meyvesuyu:"Meyve Suyu",sicak_icecek:"Sıcak İçecek",soguk_icecek:"Soğuk İçecek",tatli:"Tatlı",salata:"Salata",dondurma_kategori:"Dondurma (Kategori)"},o=Object.keys(n).filter(i=>t[i]!==null&&t[i]!==0).map(i=>({id:"editCat_"+i,db:i,label:n[i]})),r=i=>i.map(c=>`
                    <div class="edit-field">
                        <label>${c.label}</label>
                        <input type="number" id="${c.id}" value="${t[c.db]}" step="0.01">
                    </div>`).join(""),d=document.createElement("div");d.className="edit-modal-overlay",d.innerHTML=`
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
                            ${l.length>0?`
                            <div class="edit-section">
                                <h3>💰 Z Raporu Değerleri</h3>
                                <div class="edit-grid">${r(l)}</div>
                            </div>`:""}
                            ${o.length>0?`
                            <div class="edit-section">
                                <h3>🍽️ Kategori Satışları</h3>
                                <div class="edit-grid">${r(o)}</div>
                            </div>`:""}
                        </div>
                        <div class="edit-modal-actions">
                            <button onclick="this.closest('.edit-modal-overlay').remove()" class="modal-btn cancel">İptal</button>
                            <button onclick="confirmEditMyEntry('${e}')" class="modal-btn save">💾 Kaydet</button>
                        </div>
                    </div>`,document.body.appendChild(d)}catch(t){console.error("Düzenleme modal hatası:",t),alert("❌ Giriş yüklenemedi: "+t.message)}};window.confirmEditMyEntry=async function(e){var t,a,l,n,o,r,d,i,c;try{const u={rumeliZ1:parseFloat((t=document.getElementById("editRumeliZ1"))==null?void 0:t.value)||0,balikEkmek:parseFloat((a=document.getElementById("editBalikEkmek"))==null?void 0:a.value)||0,dondurmaZ:parseFloat((l=document.getElementById("editDondurma"))==null?void 0:l.value)||0,kahve:parseFloat((n=document.getElementById("editCat_kahve"))==null?void 0:n.value)||0,meyveSuyu:parseFloat((o=document.getElementById("editCat_meyvesuyu"))==null?void 0:o.value)||0,sicakIcecek:parseFloat((r=document.getElementById("editCat_sicak_icecek"))==null?void 0:r.value)||0,sogukIcecek:parseFloat((d=document.getElementById("editCat_soguk_icecek"))==null?void 0:d.value)||0,tatli:parseFloat((i=document.getElementById("editCat_tatli"))==null?void 0:i.value)||0,notlar:((c=document.getElementById("editCat_notlar"))==null?void 0:c.value)||""},{data:v,error:y}=await D(e,u,f);if(y)throw y;document.querySelector(".edit-modal-overlay").remove(),b(`✅ Güncellendi! -5 puan cezası uygulandı. Yeni puan: ${v.points_earned}`,"success"),await E(f),setTimeout(()=>location.reload(),2500)}catch(u){console.error("Güncelleme hatası:",u),alert("❌ Güncelleme başarısız: "+u.message)}};window.deleteMyEntry=async function(e){if(confirm(`⚠️ Bu girişi silmek istediğinize emin misiniz?

Bu işlem geri alınamaz!`))try{const{error:t}=await g.from("daily_reports").delete().eq("id",e);if(t)throw t;b("✅ Giriş silindi!","success"),await E(f)}catch(t){console.error("Silme hatası:",t),alert("❌ Silme başarısız: "+t.message)}};window.showScoringInfo=function(){document.getElementById("scoringInfoModal").style.display="flex"};window.closeScoringInfo=function(){document.getElementById("scoringInfoModal").style.display="none"};
