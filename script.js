import QRCode from "qrcode";

(() => {

function openIndexDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('contact-manager', 1);

   request.onupgradeneeded = (event) => {
    const db = event.target.result;

    if (!db.objectStoreNames.contains('contacts')) {
        const objectStore = db.createObjectStore('contacts', {
            keyPath: 'id'
        });

        objectStore.createIndex('name', 'name', {
            unique: false
        });

        objectStore.createIndex('phone', 'phone', {
            unique: false
        });

        objectStore.createIndex('email', 'email', {
            unique: false
        });

        objectStore.createIndex('address', 'address', {
            unique: false
        });
    }
};

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}
const databasePromise = openIndexDb();
const CONTACT_PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 50;
const IMPORT_CHUNK_SIZE = 500;
  const elements = {
    search: document.querySelector("#search-input"),
    count: document.querySelector("#contact-count"),
    grid: document.querySelector("#contacts-grid"),
    importContactsButton: document.querySelector("#import-contacts-button"),
    exportContactsButton: document.querySelector("#export-contacts-button"),
    importContactsFile: document.querySelector("#import-contacts-file"),
    importProgress: document.querySelector("#import-progress"),
    importProgressBar: document.querySelector("#import-progress-bar"),
    importProgressPercent: document.querySelector("#import-progress-percent"),
    importProgressDetail: document.querySelector("#import-progress-detail"),
    contactsPagination: document.querySelector("#contacts-pagination"),
    previousContacts: document.querySelector("#previous-contacts"),
    nextContacts: document.querySelector("#next-contacts"),
    contactsPageStatus: document.querySelector("#contacts-page-status"),
    toast: document.querySelector("#action-toast"),
    toastMessage: document.querySelector("#action-toast-message"),
    emptyState: document.querySelector("#empty-state"),
    emptyTitle: document.querySelector("#empty-title"),
    emptyDescription: document.querySelector("#empty-description"),
    emptyAction: document.querySelector("#empty-action"),
    dialog: document.querySelector("#contact-dialog"),
    form: document.querySelector("#contact-form"),
    dialogTitle: document.querySelector("#dialog-title"),
    contactId: document.querySelector("#contact-id"),
    name: document.querySelector("#contact-name"),
    phone: document.querySelector("#contact-phone"),
    email: document.querySelector("#contact-email"),
    address: document.querySelector("#contact-address"),
    qrDialog: document.querySelector("#qr-dialog"),
    qrTitle: document.querySelector("#qr-dialog-title"),
    qrImage: document.querySelector("#contact-qr-image"),
    qrStatus: document.querySelector("#qr-status"),
    closeQrDialog: document.querySelector("#close-qr-dialog"),
    doneQrDialog: document.querySelector("#done-qr-dialog"),
    downloadQrContact: document.querySelector("#download-qr-contact"),
    exportDialog: document.querySelector("#export-dialog"),
    closeExportDialog: document.querySelector("#close-export-dialog"),
    cancelExportDialog: document.querySelector("#cancel-export-dialog"),
    exportContactList: document.querySelector("#export-contact-list"),
    exportSearch: document.querySelector("#export-search-input"),
    exportPagination: document.querySelector("#export-pagination"),
    exportPrevious: document.querySelector("#export-previous"),
    exportNext: document.querySelector("#export-next"),
    exportPageStatus: document.querySelector("#export-page-status"),
    selectAllContacts: document.querySelector("#select-all-contacts"),
    exportSelectionCount: document.querySelector("#export-selection-count"),
    downloadSelectedContacts: document.querySelector("#download-selected-contacts"),
    closeDialog: document.querySelector("#close-dialog"),
    cancelDialog: document.querySelector("#cancel-dialog"),
    deleteDialog: document.querySelector("#delete-contact-dialog"),
    deleteContactName: document.querySelector("#delete-contact-name"),
    closeDeleteDialog: document.querySelector("#close-delete-dialog"),
    cancelDeleteContact: document.querySelector("#cancel-delete-contact"),
    confirmDeleteContact: document.querySelector("#confirm-delete-contact"),
  };

  let contacts = [];
  const contactsLoaded = readContacts();
  let currentQrContact = null;
  let pendingDeleteContactId = null;
  let actionToastTimeout = null;
  let actionToastFrame = null;
  let importProgressTimeout = null;
  let contactPage = 0;
  let exportPage = 0;
  let selectedExportContactIds = new Set();
  let exportSearchTimer = null;
  let searchTimer = null;

  function makeId() {
    return globalThis.crypto?.randomUUID?.() ?? `contact-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function readContacts() {
    try {
      const db = await databasePromise;
      const transaction = db.transaction("contacts", "readonly");
      const request = transaction.objectStore("contacts").index("name").getAll();
      contacts = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      render();
      return contacts;
    } catch {
      showToast("Could not load contacts from this browser.", "error");
      return contacts;
    }
  }

  function runContactWrite(action) {
    return databasePromise.then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction("contacts", "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Contact database write failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Contact database write was cancelled"));
      try {
        action(transaction.objectStore("contacts"));
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    }));
  }

  function writeContact(contact) {
    return runContactWrite((store) => store.put(contact));
  }

  function writeContactBatch(batch) {
    return runContactWrite((store) => batch.forEach((contact) => store.put(contact)));
  }

  function deleteStoredContact(id) {
    return runContactWrite((store) => store.delete(id));
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function initialsFor(name) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function icon(name) {
    return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  }

  function contactHref(kind, value) {
    const encodedValue = encodeURIComponent(String(value).trim());
    if (kind === "phone") {
      return `tel:${encodedValue.replace(/%2B/gi, "+")}`;
    }
    return `mailto:${encodedValue.replace(/%40/gi, "@")}`;
  }

  async function copyToClipboard(value) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      const temporaryField = document.createElement("textarea");
      const previousFocus = document.activeElement;
      temporaryField.value = value;
      temporaryField.setAttribute("readonly", "");
      temporaryField.style.position = "fixed";
      temporaryField.style.opacity = "0";
      document.body.append(temporaryField);
      temporaryField.select();
      let copied = false;
      try {
        copied = document.execCommand?.("copy") ?? false;
      } finally {
        temporaryField.remove();
        previousFocus?.focus?.({ preventScroll: true });
      }
      if (!copied) throw new Error("Clipboard copy failed");
    }
  }

  function showToast(message, variant = "success") {
    window.clearTimeout(actionToastTimeout);
    if (actionToastFrame !== null) window.cancelAnimationFrame(actionToastFrame);
    elements.toast.hidden = true;
    elements.toast.dataset.variant = variant;
    elements.toastMessage.textContent = "";
    actionToastFrame = window.requestAnimationFrame(() => {
      elements.toastMessage.textContent = message;
      elements.toast.hidden = false;
      actionToastTimeout = window.setTimeout(() => {
        elements.toast.hidden = true;
        elements.toastMessage.textContent = "";
        actionToastTimeout = null;
      }, 3200);
      actionToastFrame = null;
    });
  }

  function updateImportProgress(percent, detail) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    elements.importProgress.hidden = false;
    elements.importProgressBar.value = value;
    elements.importProgressPercent.textContent = `${value}%`;
    elements.importProgressDetail.textContent = detail;
  }

  function finishImportProgress() {
    window.clearTimeout(importProgressTimeout);
    importProgressTimeout = window.setTimeout(() => {
      elements.importProgress.hidden = true;
      importProgressTimeout = null;
    }, 1400);
  }

  function yieldToBrowser() {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  async function copyContactValue(button) {
    const valueLabel = button.getAttribute("aria-label").replace(/^Copy /, "");
    try {
      await copyToClipboard(button.dataset.copyValue);
      showToast(`${valueLabel} copied to clipboard.`);
    } catch {
      showToast(`${valueLabel} couldn't be copied.`, "error");
    }
  }

  function detailRow(iconName, value, kind, fallback) {
    const safeValue = escapeHtml(value ?? "");
    const label = kind === "phone" ? "Phone number" : kind === "email" ? "Email address" : "Address";
    const actionLabel = kind === "phone" ? "Call" : "Send email";
    const visibleValue = value
      ? `<div class="contact-method-row"><button class="contact-copy-button" type="button" data-copy-value="${safeValue}" aria-label="Copy ${label.toLowerCase()}"><span class="contact-method-value">${safeValue}</span></button>${kind === "phone" || kind === "email" ? `<a class="contact-method-action contact-method-action-${kind}" href="${escapeHtml(contactHref(kind, value))}" aria-label="${kind === "phone" ? `Call ${safeValue}` : `Send email to ${safeValue}`}">${actionLabel}</a>` : ""}</div>`
      : `<span class="contact-method-value contact-detail-empty">${fallback}</span>`;

    return `<li class="contact-detail contact-detail-${iconName}">${icon(iconName)}<div class="contact-detail-copy"><span class="contact-detail-label">${label}</span>${visibleValue}</div></li>`;
  }

  function escapeVCardValue(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\r|\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function foldVCardLine(line) {
    const folded = [];
    let segment = "";
    let byteLength = 0;

    for (const character of line) {
      const characterBytes = new TextEncoder().encode(character).length;
      const limit = segment ? 74 : 75;
      if (byteLength + characterBytes > limit) {
        folded.push(segment);
        segment = character;
        byteLength = characterBytes;
      } else {
        segment += character;
        byteLength += characterBytes;
      }
    }

    folded.push(segment);
    return folded.join("\r\n ");
  }

  function createVCard(contact) {
    const name = escapeVCardValue(contact.name);
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${name}`,
      `N:;${name};;;`,
    ];

    if (contact.phone) lines.push(`TEL;TYPE=VOICE:${escapeVCardValue(contact.phone)}`);
    if (contact.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(contact.email)}`);
    if (contact.address) lines.push(`ADR;TYPE=HOME:;;${escapeVCardValue(contact.address)};;;;`);
    lines.push("END:VCARD");

    return `${lines.map(foldVCardLine).join("\r\n")}\r\n`;
  }

  function downloadVCard(contact) {
    const fileName = safeFileName(contact.name);
    downloadVCardFile(createVCard(contact), `${fileName}.vcf`);
    showToast(`Downloaded ${fileName}.vcf.`);
  }

  function safeFileName(name) {
    return String(name ?? "")
      .replace(/[<>:"\/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "")
      .trim() || "contact";
  }

  function downloadVCardFile(vcard, fileName) {
    const vcardFile = new Blob([vcard], { type: "text/vcard;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(vcardFile);
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = fileName;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }

  function decodeVCardText(value) {
    return String(value ?? "")
      .replace(/\\([\\,;])/g, "$1")
      .replace(/\\[nN]/g, "\n");
  }

  function decodeQuotedPrintable(value) {
    const bytes = [];
    const input = String(value ?? "");
    const encoder = new TextEncoder();

    for (let index = 0; index < input.length;) {
      const encodedByte = input.slice(index + 1, index + 3);
      if (input[index] === "=" && /^[0-9a-f]{2}$/i.test(encodedByte)) {
        bytes.push(Number.parseInt(encodedByte, 16));
        index += 3;
      } else {
        const character = String.fromCodePoint(input.codePointAt(index));
        bytes.push(...encoder.encode(character));
        index += character.length;
      }
    }

    return new TextDecoder().decode(new Uint8Array(bytes));
  }

  function splitVCardComponents(value) {
    const components = [];
    let component = "";
    let escaped = false;

    for (const character of value) {
      if (character === ";" && !escaped) {
        components.push(component);
        component = "";
      } else {
        component += character;
      }

      if (character === "\\" && !escaped) escaped = true;
      else escaped = false;
    }

    components.push(component);
    return components;
  }

  async function parseVCards(contents) {
    const lines = String(contents ?? "")
      .replace(/=\r?\n/g, "")
      .replace(/\r\n[ \t]|\n[ \t]|\r[ \t]/g, "")
      .split(/\r\n|\n|\r/);
    const cards = [];
    let current = null;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const normalizedLine = line.trim();
      if (/^BEGIN:VCARD$/i.test(normalizedLine)) {
        current = {};
      } else if (/^END:VCARD$/i.test(normalizedLine)) {
        if (current) cards.push(current);
        current = null;
      } else if (current) {
        const separator = normalizedLine.indexOf(":");
        if (separator >= 0) {
          const descriptor = normalizedLine.slice(0, separator);
          const rawValue = normalizedLine.slice(separator + 1);
          const value = /(?:^|;)ENCODING=(?:QUOTED-PRINTABLE|Q)(?:;|$)/i.test(descriptor)
            ? decodeQuotedPrintable(rawValue)
            : rawValue;
          const property = descriptor.split(";")[0].split(".").pop().toUpperCase();

          if (property === "FN" && !current.formattedName) current.formattedName = decodeVCardText(value);
          else if (property === "N" && !current.structuredName) current.structuredName = value;
          else if (property === "TEL" && !current.phone) current.phone = decodeVCardText(value).replace(/^tel:/i, "");
          else if (property === "EMAIL" && !current.email) current.email = decodeVCardText(value);
          else if (property === "ADR" && !current.address) current.address = value;
        }
      }

      if ((lineIndex + 1) % (IMPORT_CHUNK_SIZE * 8) === 0) {
        const fraction = (lineIndex + 1) / lines.length;
        updateImportProgress(5 + fraction * 30, `Parsing VCF data: ${Math.round(fraction * 100)}%`);
        await yieldToBrowser();
      }
    }

    if (current) cards.push(current);

    const importedContacts = [];
    for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
      const card = cards[cardIndex];
      const structuredName = splitVCardComponents(card.structuredName ?? "");
      const name = (card.formattedName || [structuredName[1], structuredName[0]].filter(Boolean).join(" ")).trim();
      const address = card.address
        ? splitVCardComponents(card.address).slice(2, 7).map(decodeVCardText).filter(Boolean).join(", ")
        : "";

      if (name) {
        importedContacts.push({
          name,
          phone: String(card.phone ?? "").trim(),
          email: String(card.email ?? "").trim(),
          address: address.trim(),
        });
      }

      if ((cardIndex + 1) % IMPORT_CHUNK_SIZE === 0) {
        const fraction = cards.length ? (cardIndex + 1) / cards.length : 1;
        updateImportProgress(35 + fraction * 7, `Preparing contacts: ${cardIndex + 1} of ${cards.length}`);
        await yieldToBrowser();
      }
    }
    return importedContacts;
  }

  function contactDuplicateKey(contact) {
    const email = String(contact.email ?? "").trim().toLocaleLowerCase();
    const phone = String(contact.phone ?? "").replace(/\D/g, "");
    const noIdentityKey = !email && !phone
      ? `${String(contact.name ?? "").trim().toLocaleLowerCase()}\u0000${String(contact.address ?? "").trim().toLocaleLowerCase()}`
      : "";
    return { email, phone, noIdentityKey };
  }

  function createDuplicateIndex() {
    return { emails: new Set(), phones: new Set(), noIdentity: new Set() };
  }

  function rememberContactIdentity(indexes, contact) {
    const key = contactDuplicateKey(contact);
    if (key.email) indexes.emails.add(key.email);
    if (key.phone.length >= 5) indexes.phones.add(key.phone);
    if (key.noIdentityKey) indexes.noIdentity.add(key.noIdentityKey);
  }

  function isDuplicateContact(contact, indexes) {
    const key = contactDuplicateKey(contact);
    return (key.email && indexes.emails.has(key.email))
      || (key.phone.length >= 5 && indexes.phones.has(key.phone))
      || (key.noIdentityKey && indexes.noIdentity.has(key.noIdentityKey));
  }

  async function importVCardFile(file) {
    const committedContacts = [];
    let contactsAddedToMemory = false;
    let stage = "read";
    elements.importContactsButton.disabled = true;
    updateImportProgress(0, "Preparing to import...");

    try {
      await contactsLoaded;
      updateImportProgress(3, "Reading VCF file...");
      const fileContents = await file.text();
      stage = "parse";
      updateImportProgress(5, "Parsing VCF data...");
      const importedContacts = await parseVCards(fileContents);
      if (!importedContacts.length) {
        updateImportProgress(100, "No contacts found in this file.");
        showToast("No contacts with a name were found in that .vcf file.", "error");
        return;
      }

      let skipped = 0;
      const contactsToAdd = [];
      const duplicateIndex = createDuplicateIndex();
      stage = "deduplicate";
      for (let index = 0; index < contacts.length; index++) {
        rememberContactIdentity(duplicateIndex, contacts[index]);
        if ((index + 1) % IMPORT_CHUNK_SIZE === 0) {
          const fraction = contacts.length ? (index + 1) / contacts.length : 1;
        updateImportProgress(42 + fraction * 4, `Checking saved contacts: ${(index + 1).toLocaleString()} of ${contacts.length.toLocaleString()}`);
          await yieldToBrowser();
        }
      }

      for (let index = 0; index < importedContacts.length; index++) {
        const importedContact = importedContacts[index];
        if (isDuplicateContact(importedContact, duplicateIndex)) {
          skipped += 1;
        } else {
          const contact = { id: makeId(), ...importedContact };
          contactsToAdd.push(contact);
          rememberContactIdentity(duplicateIndex, contact);
        }

        if ((index + 1) % IMPORT_CHUNK_SIZE === 0) {
          const fraction = (index + 1) / importedContacts.length;
          updateImportProgress(46 + fraction * 9, `Checking duplicates: ${(index + 1).toLocaleString()} of ${importedContacts.length.toLocaleString()}`);
          await yieldToBrowser();
        }
      }

      stage = "save";
      for (let offset = 0; offset < contactsToAdd.length; offset += IMPORT_CHUNK_SIZE) {
        const batch = contactsToAdd.slice(offset, offset + IMPORT_CHUNK_SIZE);
        await writeContactBatch(batch);
        committedContacts.push(...batch);
        const saved = committedContacts.length;
        const fraction = contactsToAdd.length ? saved / contactsToAdd.length : 1;
        updateImportProgress(55 + fraction * 45, `Saving contacts: ${saved.toLocaleString()} of ${contactsToAdd.length.toLocaleString()}`);
        await yieldToBrowser();
      }

      contacts = committedContacts.concat(contacts);
      contacts.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
      contactPage = 0;
      contactsAddedToMemory = true;
      const added = contactsToAdd.length;
      await render();
      updateImportProgress(100, `Finished importing ${added.toLocaleString()} contacts.`);
      showToast(`Imported ${added.toLocaleString()} ${added === 1 ? "contact" : "contacts"}${skipped ? `; skipped ${skipped.toLocaleString()} duplicate${skipped === 1 ? "" : "s"}` : ""}.`);
    } catch {
      if (committedContacts.length && !contactsAddedToMemory) {
        contacts = committedContacts.concat(contacts);
        contacts.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
        contactPage = 0;
        await render();
      }
      const saved = committedContacts.length;
      updateImportProgress(100, saved ? `Import stopped after saving ${saved.toLocaleString()} contacts.` : "Import could not be completed.");
      const errorMessage = saved
        ? `Import stopped after ${saved.toLocaleString()} contacts were saved. You can retry the file; duplicates will be skipped.`
        : stage === "read" || stage === "parse"
          ? "Could not read that .vcf file. Please try another file."
          : "Could not save imported contacts. Please try again.";
      showToast(errorMessage, "error");
    } finally {
      elements.importContactsButton.disabled = false;
      finishImportProgress();
    }
  }

  function updateExportSelection() {
    const selectedCount = selectedExportContactIds.size;
    elements.selectAllContacts.checked = contacts.length > 0 && selectedCount === contacts.length;
    elements.selectAllContacts.indeterminate = selectedCount > 0 && selectedCount < contacts.length;
    elements.exportSelectionCount.textContent = `${selectedCount} of ${contacts.length} selected`;
    elements.downloadSelectedContacts.disabled = selectedCount === 0;
  }

  function renderExportContacts() {
    const query = elements.exportSearch.value.trim().toLocaleLowerCase();
    const matches = query
      ? contacts.filter((contact) => [contact.name, contact.phone, contact.email, contact.address]
          .some((value) => String(value ?? "").toLocaleLowerCase().includes(query)))
      : contacts;
    const pageCount = Math.max(1, Math.ceil(matches.length / EXPORT_PAGE_SIZE));
    exportPage = Math.min(exportPage, pageCount - 1);
    const start = exportPage * EXPORT_PAGE_SIZE;
    const visibleContacts = matches.slice(start, start + EXPORT_PAGE_SIZE);

    elements.exportContactList.innerHTML = visibleContacts.map((contact) => {
      const summary = [contact.phone, contact.email, contact.address].filter(Boolean).join(" | ") || "No additional details";
      return `
        <label class="export-contact-option">
          <input type="checkbox" data-export-contact-id="${escapeHtml(contact.id)}" ${selectedExportContactIds.has(contact.id) ? "checked" : ""} />
          <span class="export-contact-copy">
            <strong>${escapeHtml(contact.name)}</strong>
            <small>${escapeHtml(summary)}</small>
          </span>
        </label>`;
    }).join("") || `<p class="export-no-matches">No matching contacts.</p>`;

    elements.exportPagination.hidden = matches.length <= EXPORT_PAGE_SIZE;
    elements.exportPrevious.disabled = exportPage === 0;
    elements.exportNext.disabled = exportPage >= pageCount - 1;
    elements.exportPageStatus.textContent = matches.length
      ? `Showing ${(start + 1).toLocaleString()} - ${Math.min(start + visibleContacts.length, matches.length).toLocaleString()} of ${matches.length.toLocaleString()} | Page ${exportPage + 1} of ${pageCount}`
      : "No matching contacts";
    updateExportSelection();
  }

  async function openExportDialog() {
    await contactsLoaded;
    selectedExportContactIds = new Set();
    exportPage = 0;
    elements.exportSearch.value = "";
    elements.selectAllContacts.checked = false;
    elements.selectAllContacts.indeterminate = false;
    renderExportContacts();
    elements.exportDialog.showModal();
  }

  function exportSelectedContacts() {
    const selectedContacts = contacts.filter((contact) => selectedExportContactIds.has(contact.id));
    if (!selectedContacts.length) return;

    const vcard = selectedContacts.map(createVCard).join("");
    const fileName = selectedContacts.length === 1 ? `${safeFileName(selectedContacts[0].name)}.vcf` : "contacts.vcf";
    downloadVCardFile(vcard, fileName);
    elements.exportDialog.close();
    showToast(`Exported ${selectedContacts.length} ${selectedContacts.length === 1 ? "contact" : "contacts"}.`);
  }

  async function showContactQr(contact) {
    currentQrContact = contact;
    elements.qrTitle.textContent = `QR code for ${contact.name}`;
    elements.qrImage.hidden = true;
    elements.qrImage.removeAttribute("src");
    elements.qrImage.alt = `QR code containing ${contact.name}'s contact details`;
    elements.qrStatus.hidden = false;
    elements.qrStatus.textContent = "Preparing QR code...";
    elements.qrDialog.showModal();

    try {
      const qrDataUrl = await QRCode.toDataURL(createVCard(contact), {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 280,
        color: { dark: "#15253b", light: "#ffffff" },
      });
      if (currentQrContact?.id !== contact.id) return;
      elements.qrImage.src = qrDataUrl;
      elements.qrImage.hidden = false;
      elements.qrStatus.hidden = true;
    } catch {
      elements.qrStatus.textContent = "Could not create this QR code. You can still download the .vcf file.";
    }
  }
  function contactCard(contact) {
    const name = escapeHtml(contact.name);
    const id = escapeHtml(contact.id);
    return `
      <article class="contact-card">
        <header class="contact-card-header">
          <div class="avatar" aria-hidden="true">${escapeHtml(initialsFor(contact.name))}</div>
          <div class="contact-card-heading">
            <h2 class="contact-name" title="${name}">${name}</h2>
            <p class="contact-label">Saved contact</p>
          </div>
        </header>
        <ul class="contact-details">
          ${detailRow("phone", contact.phone, "phone", "No phone added")}
          ${detailRow("mail", contact.email, "email", "No email added")}
          ${detailRow("pin", contact.address, "text", "No address added")}
        </ul>
        <footer class="contact-card-footer">
          <button class="card-action" type="button" title="Download contact file" aria-label="Download ${name} as a VCF file" data-contact-action="download" data-contact-id="${id}">${icon("download")}<span>Save .vcf</span></button>
          <button class="card-action" type="button" title="Show QR code" aria-label="Show QR code for ${name}" data-contact-action="qr" data-contact-id="${id}">${icon("qr")}<span>QR code</span></button>
          <button class="card-action" type="button" title="Edit contact" aria-label="Edit ${name}" data-contact-action="edit" data-contact-id="${id}">${icon("edit")}<span>Edit</span></button>
          <button class="card-action card-action-danger" type="button" title="Delete contact" aria-label="Delete ${name}" data-contact-action="delete" data-contact-id="${id}">${icon("trash")}<span>Delete</span></button>
        </footer>
      </article>`;
  }

  function contactMatchesQuery(contact, query) {
    return [contact.name, contact.phone, contact.email, contact.address]
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
  }

  function render() {
    const query = elements.search.value.trim().toLocaleLowerCase();
    const matchingContacts = query ? contacts.filter((contact) => contactMatchesQuery(contact, query)) : contacts;
    const pageCount = Math.max(1, Math.ceil(matchingContacts.length / CONTACT_PAGE_SIZE));
    contactPage = Math.min(contactPage, pageCount - 1);
    const start = contactPage * CONTACT_PAGE_SIZE;
    const visibleContacts = matchingContacts.slice(start, start + CONTACT_PAGE_SIZE);

    elements.count.textContent = query
      ? `${matchingContacts.length.toLocaleString()} of ${contacts.length.toLocaleString()} contacts`
      : `${contacts.length.toLocaleString()} ${contacts.length === 1 ? "contact" : "contacts"}`;
    elements.exportContactsButton.disabled = contacts.length === 0;

    elements.grid.innerHTML = visibleContacts.map(contactCard).join("");
    elements.contactsPagination.hidden = matchingContacts.length <= CONTACT_PAGE_SIZE;
    elements.previousContacts.disabled = contactPage === 0;
    elements.nextContacts.disabled = contactPage >= pageCount - 1;
    elements.contactsPageStatus.textContent = matchingContacts.length
      ? `Showing ${(start + 1).toLocaleString()} - ${Math.min(start + visibleContacts.length, matchingContacts.length).toLocaleString()} of ${matchingContacts.length.toLocaleString()} | Page ${contactPage + 1} of ${pageCount}`
      : "";
    const showEmptyState = matchingContacts.length === 0;
    elements.emptyState.hidden = !showEmptyState;

    if (!showEmptyState) return;

    if (contacts.length === 0) {
      elements.emptyTitle.textContent = "No contacts yet";
      elements.emptyDescription.textContent = "Add your first contact to get started.";
      elements.emptyAction.dataset.mode = "add";
      elements.emptyAction.innerHTML = `${icon("plus")}<span>Add contact</span>`;
    } else {
      elements.emptyTitle.textContent = "No matches found";
      elements.emptyDescription.textContent = "Try another name, phone number, email, or address.";
      elements.emptyAction.dataset.mode = "clear";
      elements.emptyAction.innerHTML = "<span>Clear search</span>";
    }
  }

  function openDialog(contact = null) {
    elements.form.reset();
    elements.contactId.value = contact?.id ?? "";
    elements.name.value = contact?.name ?? "";
    elements.phone.value = contact?.phone ?? "";
    elements.email.value = contact?.email ?? "";
    elements.address.value = contact?.address ?? "";
    elements.dialogTitle.textContent = contact ? "Edit contact" : "Add contact";
    elements.dialog.showModal();
    requestAnimationFrame(() => elements.name.focus());
  }

  function closeDialog() {
    elements.dialog.close();
  }

  function openDeleteDialog(contact) {
    pendingDeleteContactId = contact.id;
    elements.deleteContactName.textContent = contact.name;
    elements.deleteDialog.showModal();
    requestAnimationFrame(() => elements.cancelDeleteContact.focus());
  }

  function closeDeleteDialog() {
    elements.deleteDialog.close();
  }

  async function deletePendingContact() {
    const contact = contacts.find((item) => item.id === pendingDeleteContactId);
    if (!contact) {
      closeDeleteDialog();
      return;
    }

    elements.confirmDeleteContact.disabled = true;
    const deletedName = contact.name;
    try {
      await deleteStoredContact(contact.id);
      contacts = contacts.filter((item) => item.id !== contact.id);
      contactPage = 0;
      closeDeleteDialog();
      render();
      showToast(`${deletedName} deleted.`);
    } catch {
      showToast(`Could not delete ${deletedName}. Please try again.`, "error");
    } finally {
      elements.confirmDeleteContact.disabled = false;
    }
  }

  document.querySelectorAll("[data-open-dialog]").forEach((button) => {
    button.addEventListener("click", () => openDialog());
  });

  elements.emptyAction.addEventListener("click",async () => {
    if (elements.emptyAction.dataset.mode === "clear") {
      elements.search.value = "";
      await render();
      elements.search.focus();
      return;
    }
    openDialog();
  });

  elements.search.addEventListener("input", () => {
    contactPage = 0;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(render, 120);
  });
  elements.previousContacts.addEventListener("click", () => {
    contactPage = Math.max(0, contactPage - 1);
    render();
  });
  elements.nextContacts.addEventListener("click", () => {
    contactPage += 1;
    render();
  });
  elements.importContactsButton.addEventListener("click", () => elements.importContactsFile.click());
  elements.importContactsFile.addEventListener("change", async () => {
    const [file] = elements.importContactsFile.files ?? [];
    if (file) await importVCardFile(file);
    elements.importContactsFile.value = "";
  });
  elements.exportContactsButton.addEventListener("click", openExportDialog);
  elements.closeExportDialog.addEventListener("click", () => elements.exportDialog.close());
  elements.cancelExportDialog.addEventListener("click", () => elements.exportDialog.close());
  elements.exportContactList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-export-contact-id]");
    if (!checkbox) return;
    if (checkbox.checked) selectedExportContactIds.add(checkbox.dataset.exportContactId);
    else selectedExportContactIds.delete(checkbox.dataset.exportContactId);
    updateExportSelection();
  });
  elements.selectAllContacts.addEventListener("change", () => {
    selectedExportContactIds = elements.selectAllContacts.checked
      ? new Set(contacts.map((contact) => contact.id))
      : new Set();
    renderExportContacts();
  });
  elements.exportSearch.addEventListener("input", () => {
    exportPage = 0;
    window.clearTimeout(exportSearchTimer);
    exportSearchTimer = window.setTimeout(renderExportContacts, 120);
  });
  elements.exportPrevious.addEventListener("click", () => {
    exportPage = Math.max(0, exportPage - 1);
    renderExportContacts();
  });
  elements.exportNext.addEventListener("click", () => {
    exportPage += 1;
    renderExportContacts();
  });
  elements.downloadSelectedContacts.addEventListener("click", exportSelectedContacts);
  elements.exportDialog.addEventListener("click", (event) => {
    if (event.target === elements.exportDialog) elements.exportDialog.close();
  });
  elements.closeDialog.addEventListener("click", closeDialog);
  elements.cancelDialog.addEventListener("click", closeDialog);
  elements.closeDeleteDialog.addEventListener("click", closeDeleteDialog);
  elements.cancelDeleteContact.addEventListener("click", closeDeleteDialog);
  elements.confirmDeleteContact.addEventListener("click", deletePendingContact);
  elements.deleteDialog.addEventListener("close", () => {
    pendingDeleteContactId = null;
  });
  elements.deleteDialog.addEventListener("click", (event) => {
    if (event.target === elements.deleteDialog) closeDeleteDialog();
  });
  const closeQrDialog = () => elements.qrDialog.close();
  elements.closeQrDialog.addEventListener("click", closeQrDialog);
  elements.doneQrDialog.addEventListener("click", closeQrDialog);
  elements.downloadQrContact.addEventListener("click", () => {
    if (!currentQrContact) return;
    downloadVCard(currentQrContact);
    closeQrDialog();
  });
  elements.qrDialog.addEventListener("click", (event) => {
    if (event.target === elements.qrDialog) closeQrDialog();
  });
  elements.name.addEventListener("input", () => {
    if (elements.name.value.trim()) elements.name.setCustomValidity("");
  });

  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) closeDialog();
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.name.setCustomValidity(elements.name.value.trim() ? "" : "Please enter a name.");
    if (!elements.form.reportValidity()) return;
    await contactsLoaded;

    const nextContact = {
      id: elements.contactId.value || makeId(),
      name: elements.name.value.trim(),
      phone: elements.phone.value.trim(),
      email: elements.email.value.trim(),
      address: elements.address.value.trim(),
    };

    const existingIndex = contacts.findIndex((contact) => contact.id === nextContact.id);
    const isEditing = existingIndex !== -1;
    try {
      await writeContact(nextContact);
    } catch {
      showToast("Could not save this contact. Please try again.", "error");
      return;
    }

    if (existingIndex === -1) contacts.push(nextContact);
    else contacts[existingIndex] = nextContact;
    contacts.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
    contactPage = 0;

    closeDialog();
    render();
    showToast(isEditing ? "Contact updated." : "Contact added.");
  });

  elements.grid.addEventListener("click", async (event) => {
    await contactsLoaded;
    const copyButton = event.target.closest("[data-copy-value]");
    if (copyButton) {
      await copyContactValue(copyButton);
      return;
    }

    const button = event.target.closest("[data-contact-action]");
    if (!button) return;

    const contact = contacts.find((item) => item.id === button.dataset.contactId);
    if (!contact) return;

    if (button.dataset.contactAction === "download") {
      downloadVCard(contact);
      return;
    }
    if (button.dataset.contactAction === "qr") {
      await showContactQr(contact);
      return;
    }

    if (button.dataset.contactAction === "edit") {
      openDialog(contact);
      return;
    }

    if (button.dataset.contactAction === "delete") openDeleteDialog(contact);
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      elements.search.focus();
    }
  });

  render();
})();
