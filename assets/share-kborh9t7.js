import{m as R,c as F,D as H,o as U,b as M,p as G,q as W,f as x,e as X,v as Q}from"./index-CRnjr3qj.js";import{E as Y,h as V}from"./pdf-ZKwDf_91.js";const N=794,h=1123,m=48,k=48,A=214,E=77;function g(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}function D(e){return g((e==null?void 0:e.trim())||"").replaceAll(`
`,"<br />")}function K(e){return e.trim().split(/\r?\n/).map(t=>{const a=g(t.trimEnd());return`<div class="bank-detail-line" data-bank-detail-line>${a.trim()?a:"&nbsp;"}</div>`}).join("")}function $(e){return!!(e!=null&&e.trim())}function J(e){const t=e==null?void 0:e.trim().toLowerCase();return t?!["official stamp area","stamp area","bank transfer"].includes(t):!1}function p(e,t){return/^#[0-9a-f]{6}$/i.test(e)?`${e}${t}`:e}function Z(e){const t=R(e),a=F(e),i=5+(t.includeDiscount?1:0)+(t.includeTax?1:0),s=t.includeDiscount||a.discountTotal>0,r=H[e.type],n=e.business.accentColor||"#DD8201",o=[e.business.address,e.business.phone,e.business.email,e.business.website].filter($),l=[e.client.name?`Attn: ${e.client.name}`:"",e.client.address,e.client.phone,e.client.email].filter($),d=!!e.business.showClientDetails&&l.length>0,u=!!e.business.showNotes&&$(e.notes),w=!!e.business.showTerms&&$(e.terms),P=U(e.business),j=P.length>0,T=!!e.business.signatureDataUrl,S=J(e.business.stampLabel),B=!!e.business.logoDataUrl,I=M(e.issueDate||e.createdAt);return`
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Manrope, "Segoe UI", sans-serif;
        color: #20323f;
        background: #f8fbf7;
      }
      .sheet {
        width: ${N}px;
        min-height: ${h}px;
        padding: ${m}px 46px;
        background: white;
        position: relative;
      }
      .sheet::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at top right, ${p(n,"14")}, transparent 26%),
          linear-gradient(180deg, ${p(n,"0a")}, transparent 28%);
        pointer-events: none;
      }
      .sheet > * { position: relative; z-index: 1; }
      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
      }
      .brand {
        max-width: 430px;
      }
      .logo-slot {
        display: flex;
        align-items: center;
        max-width: 430px;
      }
      .logo-slot--image {
        align-items: flex-start;
        justify-content: flex-start;
        width: ${A}px;
        max-width: ${A}px;
        max-height: ${E}px;
        overflow: hidden;
      }
      .doc-meta {
        min-width: 240px;
        text-align: right;
      }
      .brand-logo {
        width: 64px;
        height: 64px;
        border-radius: 20px;
        overflow: hidden;
        background: ${p(n,"14")};
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 26px;
        color: ${n};
      }
      .brand-logo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .logo-slot img {
        display: block;
        width: auto;
        height: auto;
        max-width: ${A}px;
        max-height: ${E}px;
        object-fit: contain;
        object-position: left top;
      }
      .eyebrow {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.22em;
        color: ${n};
        margin-bottom: 8px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        color: #274053;
        line-height: 0.95;
      }
      .brand-name {
        margin-bottom: 14px;
        font-size: 48px;
      }
      .muted {
        color: #5b6f7e;
        line-height: 1.55;
        white-space: pre-line;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        padding: 8px 14px;
        border-radius: 999px;
        background: ${p(n,"14")};
        color: ${n};
        font-weight: 700;
        font-size: 12px;
        text-transform: uppercase;
      }
      .doc-date {
        margin-top: 12px;
        font-size: 14px;
        font-weight: 700;
        color: #5b6f7e;
      }
      .doc-date span {
        color: #20323f;
      }
      .divider {
        height: 6px;
        border-radius: 999px;
        margin: 28px 0 24px;
        background: linear-gradient(90deg, ${n}, ${p(n,"22")});
      }
      .grid {
        display: grid;
        grid-template-columns: 1.3fr 1fr;
        gap: 20px;
      }
      .meta {
        background: #f5f9f7;
        border: 1px solid ${p(n,"22")};
        border-radius: 20px;
        padding: 20px;
      }
      .meta-item { margin-bottom: 14px; }
      .meta-item:last-child { margin-bottom: 0; }
      .meta-label {
        display: block;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: #69806f;
        margin-bottom: 6px;
      }
      .meta-value {
        font-size: 16px;
        font-weight: 700;
        color: #20323f;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 24px;
        overflow: hidden;
        border-radius: 20px;
      }
      thead th {
        background: ${n};
        color: white;
        padding: 14px 12px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      tbody td {
        padding: 14px 12px;
        border-bottom: 1px solid #e6eeea;
        vertical-align: top;
        font-size: 13px;
      }
      tbody tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      tbody tr:nth-child(even) td {
        background: #fbfdfb;
      }
      .description-cell {
        overflow-wrap: anywhere;
        word-break: normal;
      }
      .summary-row td {
        background: #f7faf8;
      }
      .summary-label {
        text-align: right;
        font-weight: 700;
        color: #436052;
      }
      .summary-value {
        text-align: right;
        font-weight: 700;
        color: #20323f;
      }
      .grand-row td {
        background: ${p(n,"12")};
        color: ${n};
        font-weight: 800;
        font-size: 15px;
      }
      .summary-row,
      .grand-row,
      .notes-grid,
      .notes-card,
      .signature {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .numeric {
        text-align: right;
        white-space: nowrap;
      }
      .notes-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
        margin-top: 26px;
      }
      .notes-card {
        padding: 18px;
        border-radius: 18px;
        border: 1px solid ${p(n,"22")};
        background: #fcfefd;
      }
      .notes-card h3 {
        margin: 0 0 10px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #577468;
      }
      .bank-details {
        margin-top: 24px;
      }
      .bank-details h3,
      .bank-continuation-heading {
        margin: 0 0 8px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #577468;
      }
      .bank-continuation-heading {
        margin-top: 0;
      }
      .bank-account {
        padding: 4px 0;
        break-inside: avoid;
      }
      .bank-account + .bank-account {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 0.5px solid ${p(n,"66")};
      }
      .bank-account-label {
        margin-bottom: 4px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: ${n};
      }
      .bank-account-continuation-label {
        margin: 2px 0 4px;
      }
      .bank-account-text {
        color: #5b6f7e;
        line-height: 1.55;
        white-space: normal;
      }
      .bank-detail-line {
        min-height: 1.55em;
        overflow-wrap: anywhere;
      }
      .pdf-page-break-spacer {
        display: block;
        width: 100%;
        margin: 0;
        padding: 0;
        border: 0;
      }
      .pdf-table-break-spacer td {
        height: var(--pdf-table-spacer-height, 0);
        padding: 0 !important;
        border: 0 !important;
        background: white !important;
        line-height: 0;
      }
      .pdf-table-repeat-header th {
        background: ${n};
        color: white;
        padding: 14px 12px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      .signature {
        margin-top: 28px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      .signature-box {
        min-height: 98px;
        border: 1px dashed ${p(n,"55")};
        border-radius: 18px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
      }
      .signature-box img {
        max-height: 58px;
        max-width: 180px;
        object-fit: contain;
      }
    </style>
      <div class="sheet">
        <div class="topbar">
          <div class="brand">
          <div class="logo-slot ${B?"logo-slot--image":"logo-slot--fallback"}">
            ${B?`<img src="${e.business.logoDataUrl}" alt="Logo" />`:`<div style="display:flex;align-items:center;gap:16px;">
                    <div class="brand-logo">${g((e.business.name||"QF").split(" ").filter(Boolean).slice(0,2).map(c=>{var v;return((v=c[0])==null?void 0:v.toUpperCase())||""}).join(""))}</div>
                    <h1 class="brand-name">${g(e.business.name||"Your business")}</h1>
                  </div>`}
          </div>
          <div class="muted">${o.map(c=>D(c)).join("<br />")}</div>
        </div>
        <div class="doc-meta">
          <div class="pill" style="background:${p(n,"14")};color:${n};">${r}</div>
          <div style="margin-top:14px;font-size:22px;font-weight:800;line-height:1;white-space:nowrap;color:#274053;">${g(e.number)}</div>
          <div class="doc-date">Date: <span>${g(I)}</span></div>
        </div>
      </div>

      <div class="divider" style="background:linear-gradient(90deg, ${n}, ${p(n,"22")});"></div>

      <div class="grid" style="grid-template-columns:1fr;">
        <div>
          <div class="eyebrow" style="color:${n};">To</div>
          <div style="font-size:28px;font-weight:800;color:#21363f;">
            ${g(e.client.company||e.client.name||"Client")}
          </div>
          ${d?`<div class="muted">${l.map(c=>D(c)).join("<br />")}</div>`:""}
        </div>
      </div>

      <table data-document-table>
        <thead>
          <tr>
            <th style="text-align:left;">Item</th>
            <th style="text-align:left;">Description</th>
            <th class="numeric">Qty</th>
            <th class="numeric">Price</th>
            ${t.includeDiscount?'<th class="numeric">Discount</th>':""}
            ${t.includeTax?'<th class="numeric">Tax</th>':""}
            <th class="numeric">Line total</th>
          </tr>
        </thead>
        <tbody>
          ${e.items.map(c=>{const v=G(c,t),C=W(c);return`
                <tr data-item-row>
                  <td><strong>${g(c.name||"Item")}</strong></td>
                  <td class="description-cell">${g(c.description||"-")}</td>
                  <td class="numeric">${c.quantity}</td>
                  <td class="numeric">${x(c.unitPrice,e.currency)}</td>
                  ${t.includeDiscount?`<td class="numeric">${C?"-":`${c.discount}%`}</td>`:""}
                  ${t.includeTax?`<td class="numeric">${C?"-":`${c.tax}%`}</td>`:""}
                  <td class="numeric"><strong>${x(v.lineTotal,e.currency)}</strong></td>
                </tr>
              `}).join("")}
          <tr class="summary-row" data-summary-row>
            <td class="summary-label" colspan="${i-1}">Subtotal</td>
            <td class="summary-value">${x(a.subtotal,e.currency)}</td>
          </tr>
          ${s?`<tr class="summary-row" data-summary-row>
            <td class="summary-label" colspan="${i-1}">Discount</td>
            <td class="summary-value">${x(-a.discountTotal,e.currency)}</td>
          </tr>`:""}
          ${t.includeTax?`<tr class="summary-row" data-summary-row>
            <td class="summary-label" colspan="${i-1}">Tax total</td>
            <td class="summary-value">${x(a.taxTotal,e.currency)}</td>
          </tr>`:""}
          <tr class="grand-row" data-summary-row>
            <td class="summary-label" colspan="${i-1}" style="color:${n};">Grand total</td>
            <td class="summary-value" style="color:${n};">${x(a.grandTotal,e.currency)}</td>
          </tr>
        </tbody>
      </table>

      ${u||w?`
      <div class="notes-grid" data-keep-block>
        ${u?`<div class="notes-card">
          <h3>Notes</h3>
          <div class="muted">${D(e.notes)}</div>
        </div>`:""}
        ${w?`<div class="notes-card">
          <h3>Terms and Conditions</h3>
          <div class="muted">${D(e.terms)}</div>
        </div>`:""}
      </div>
      `:""}

      ${j?`<div class="bank-details" data-bank-details>
        <h3 data-bank-heading>Banking Details</h3>
        ${P.map(c=>`<div class="bank-account" data-bank-account data-bank-account-label="${g(c.label)}">
          ${$(c.label)?`<div class="bank-account-label">${g(c.label)}</div>`:""}
          <div class="bank-account-text">${K(c.details)}</div>
        </div>`).join("")}
      </div>`:""}

      ${T||S?`<div class="signature" data-keep-block>
        ${T?`<div class="signature-box">
          <img src="${e.business.signatureDataUrl}" alt="Signature" />
          <strong>Authorized signature</strong>
        </div>`:""}
        ${S?`<div class="signature-box">
          <div style="font-size:22px;font-weight:800;color:${n};">${g(e.business.stampLabel||"")}</div>
        </div>`:""}
      </div>`:""}

    </div>
  `}function ee(e,t){return e.getBoundingClientRect().top-t.getBoundingClientRect().top}function q(e,t){const a=ee(e,t)%h;return a<0?a+h:a}function f(e){return e.getBoundingClientRect().height}function b(e,t,a=f(e)){const i=q(e,t);return i<=m+1?!1:i+a>h-k+1}function O(e,t){const a=q(e,t);return a<=m?Math.max(m-a,0):h-a+m}function y(e,t,a={}){const i=e.parentElement;if(!i)return;const s=O(e,t);if(s>1){const r=document.createElement("div");r.className="pdf-page-break-spacer",r.style.height=`${s}px`,i.insertBefore(r,e)}if(a.continuationHeading){const r=document.createElement("div");r.className="bank-continuation-heading",r.textContent="Banking Details (continued)",i.insertBefore(r,e)}if(a.accountLabel){const r=document.createElement("div");r.className="bank-account-label bank-account-continuation-label",r.textContent=`${a.accountLabel} (continued)`,i.insertBefore(r,e)}}function te(e){return e.reduce((t,a)=>t+f(a),0)}function ae(e){const t=Array.from(e.querySelectorAll("thead th"));if(t.length===0)return;const a=document.createElement("tr");return a.className="pdf-table-repeat-header",t.forEach(i=>{const s=document.createElement("th");s.className=i.className,s.textContent=i.textContent||"";const r=i.getAttribute("style");r&&s.setAttribute("style",r),a.appendChild(s)}),a}function L(e,t,a={}){const i=e.parentElement,s=e.closest("table");if(!i||!(s instanceof HTMLTableElement))return;const r=s.querySelectorAll("thead th").length||e.cells.length||1,n=O(e,t);if(n>1){const o=document.createElement("tr");o.className="pdf-table-break-spacer",o.style.setProperty("--pdf-table-spacer-height",`${n}px`);const l=document.createElement("td");l.colSpan=r,l.innerHTML="&nbsp;",o.appendChild(l),i.insertBefore(o,e)}if(a.repeatHeader){const o=ae(s);o&&i.insertBefore(o,e)}}function ne(e){const t=e.querySelector("[data-document-table]");if(!t)return;const a=Array.from(t.querySelectorAll("[data-item-row]")),i=Array.from(t.querySelectorAll("[data-summary-row]")),s=a[0],r=t.querySelector("thead"),n=h-m-k;if(s){const d=f(r||s)+Math.min(f(s),96);b(t,e,d)&&y(t,e)}a.forEach((d,u)=>{const w=f(d);w>=n||b(d,e,w)&&L(d,e,{repeatHeader:u>0})});const o=i[0];if(!o)return;const l=te(i);l<n&&b(o,e,l)&&L(o,e)}function _(e){const t=h-m-k;Array.from(e.querySelectorAll("[data-keep-block]")).forEach(i=>{const s=f(i);s>=t||b(i,e,s)&&y(i,e)})}function ie(e,t){var r;const a=Array.from(e.querySelectorAll("[data-bank-detail-line]")),i=(r=e.dataset.bankAccountLabel)==null?void 0:r.trim(),s=h-m-k;a.forEach(n=>{const o=f(n);o>=s||b(n,t,o)&&y(n,t,{continuationHeading:!0,accountLabel:i})})}function se(e){const t=e.querySelector("[data-bank-details]");if(!t)return;const a=t.querySelector("[data-bank-heading]"),i=Array.from(t.querySelectorAll("[data-bank-account]"));if(i.length===0)return;const s=a?f(a)+8:0,r=Math.min(f(i[0]),96);b(t,e,s+r)&&y(t,e);const n=h-m-k;i.forEach((o,l)=>{const d=f(o),u=Math.min(d,96);b(o,e,u)?y(o,e,{continuationHeading:l>0}):d<=n&&b(o,e,d)&&y(o,e,{continuationHeading:l>0}),ie(o,e)})}async function re(e){var a;const t=document.createElement("div");t.style.position="fixed",t.style.left="-10000px",t.style.top="0",t.style.width=`${N}px`,t.innerHTML=e,document.body.appendChild(t);try{await((a=document.fonts)==null?void 0:a.ready);const i=Array.from(t.querySelectorAll("img"));await Promise.all(i.map(n=>n.complete?Promise.resolve():new Promise(o=>{n.onload=()=>o(),n.onerror=()=>o()})));const s=t.querySelector(".sheet");if(!(s instanceof HTMLElement))throw new Error("Could not prepare the PDF layout.");return ne(s),_(s),se(s),_(s),await new Promise(n=>requestAnimationFrame(()=>n())),await V(s,{scale:2,backgroundColor:"#ffffff",useCORS:!0,logging:!1,windowWidth:s.scrollWidth,windowHeight:s.scrollHeight})}finally{document.body.removeChild(t)}}async function oe(e){const t=await re(Z(e)),a=new Y("p","pt","a4"),i=a.internal.pageSize.getWidth(),s=a.internal.pageSize.getHeight(),r=i,n=t.height*r/t.width,o=t.toDataURL("image/png");let l=n,d=0;for(a.addImage(o,"PNG",0,d,r,n,void 0,"FAST"),l-=s;l>2;)d=l-n,a.addPage(),a.addImage(o,"PNG",0,d,r,n,void 0,"FAST"),l-=s;return a.output("blob")}function le(e){return typeof window>"u"?"":`${window.location.origin}/records/${e.id}?download=pdf`}function z(e,t){const a=H[e.type],i=e.client.company||e.client.name||"Client",s=e.business.name||"QuoteFlow",r=F(e),n=x(r.grandTotal,e.currency),o=t?`

PDF link: ${t}`:"";return`Hello,

Please find ${a} ${e.number} from ${s}.

Client: ${i}
Grand Total: ${n}
Date: ${M(e.issueDate)}${o}

Thank you.`}function ce(e){return e.trim().replace(/[^\w\s.-]/g,"").replace(/\s+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,80)}function de(e){const t=e.client.company||e.client.name||"CLIENT";return`${[e.number,t].map(ce).filter(Boolean).join("-")||"quoteflow-document"}.pdf`}function pe(e){const t=Q(e);if(window.open(t,"_blank","noopener,noreferrer"))return!0;const i=document.createElement("a");return i.href=t,i.target="_blank",i.rel="noopener noreferrer",i.style.display="none",document.body.appendChild(i),i.click(),document.body.removeChild(i),!0}function fe(e){return e.mode==="web-share"?"Share sheet opened. Choose WhatsApp to send the PDF.":e.mode==="cancelled"?"Share cancelled. The document is still saved.":e.whatsappOpened?"PDF downloaded. WhatsApp opened with the prepared message; attach the downloaded PDF if needed.":"PDF downloaded. WhatsApp could not open automatically, so attach the PDF manually."}async function me(e){var d;const t=le(e),a=z(e),i=await oe(e),s=de(e),r=new File([i],s,{type:"application/pdf"}),n=navigator;if(typeof n.share=="function"&&((d=n.canShare)!=null&&d.call(n,{files:[r]}))){try{await n.share({title:`${H[e.type]} ${e.number}`,text:a,files:[r]})}catch(u){if(u instanceof DOMException&&u.name==="AbortError")return{mode:"cancelled",message:a};throw u}return{mode:"web-share",message:a,filename:s}}const o=z(e,t);X(i,s);const l=pe(o);return{mode:"download-whatsapp-link",message:o,shareUrl:t,filename:s,whatsappOpened:l}}export{fe as a,oe as g,me as s};
