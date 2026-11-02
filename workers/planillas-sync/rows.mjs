// Same parsing and continuation-row rules as the manual synchronizer.
export const normalizeText = (text) => {
    if (!text)
        return "";
    return text
        .toString()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
};
export const parseSpanishNumber = (val) => {
    if (!val)
        return 0;
    let clean = val.toString().trim().replace(/[^0-9.,-]/g, '');
    if (!clean)
        return 0;
    const hasComma = clean.includes(',');
    const hasDot = clean.includes('.');
    if (hasComma && hasDot) {
        clean = clean.replace(/\./g, '').replace(/,/g, '.');
    }
    else if (hasComma) {
        clean = clean.replace(/,/g, '.');
    }
    else if (hasDot) {
        clean = clean.replace(/\./g, '');
    }
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
};
export const parseCSV = (csvText) => {
    const result = [];
    let currentWord = '';
    let inQuotes = false;
    let currentRow = [];
    const text = csvText.replace(/\r\n/g, '\n');
    const firstLine = text.split('\n')[0] || '';
    const delimiter = firstLine.includes(';') ? ';' : ',';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentWord += '"';
                i++;
            }
            else if (char === '"') {
                inQuotes = false;
            }
            else {
                currentWord += char;
            }
        }
        else {
            if (char === '"') {
                inQuotes = true;
            }
            else if (char === delimiter) {
                currentRow.push(currentWord.trim());
                currentWord = '';
            }
            else if (char === '\n') {
                currentRow.push(currentWord.trim());
                if (currentRow.length > 1 || currentRow[0] !== '') {
                    result.push(currentRow);
                }
                currentRow = [];
                currentWord = '';
            }
            else {
                currentWord += char;
            }
        }
    }
    currentRow.push(currentWord.trim());
    if (currentRow.length > 1 || currentRow[0] !== '') {
        result.push(currentRow);
    }
    return result;
};
export const mergeContiguousSheetRows = (rows) => {
    if (rows.length <= 1)
        return rows;
    const merged = [rows[0]];
    for (let i = 1; i < rows.length; i++) {
        const currentRow = [...rows[i]];
        const prevRow = merged[merged.length - 1];
        const code1 = (prevRow[1] || "").trim().toUpperCase();
        const code2 = (currentRow[1] || "").trim().toUpperCase();
        const match1 = code1.match(/^([A-Z]+)(\d+)$/);
        const match2 = code2.match(/^([A-Z]+)(\d+)$/);
        let isConsecutive = false;
        if (match1 && match2 && match1[1] === match2[1]) {
            const num1 = parseInt(match1[2], 10);
            const num2 = parseInt(match2[2], 10);
            if (Math.abs(num1 - num2) === 1) {
                isConsecutive = true;
            }
        }
        const client1 = normalizeText(prevRow[5] || "");
        const client2 = normalizeText(currentRow[5] || "");
        const sameClient = client1 === client2 && client1 !== "";
        const date1 = (prevRow[3] || "").trim();
        const date2 = (currentRow[3] || "").trim();
        const sameDate = date1 === date2 && date1 !== "";
        const addr1 = normalizeText(prevRow[18] || "");
        const addr2 = normalizeText(currentRow[18] || "");
        const sameAddr = addr1 === addr2 && addr1 !== "";
        if (isConsecutive && sameClient && sameDate && sameAddr) {
            prevRow[1] = `${prevRow[1].trim()} / ${currentRow[1].trim()}`;
            const subtotal1 = parseSpanishNumber(prevRow[28]);
            const subtotal2 = parseSpanishNumber(currentRow[28]);
            prevRow[28] = (subtotal1 + subtotal2).toString();
            const freight1 = parseSpanishNumber(prevRow[27]);
            const freight2 = parseSpanishNumber(currentRow[27]);
            prevRow[27] = (freight1 + freight2).toString();
            const surcharge1 = parseSpanishNumber(prevRow[25]);
            const surcharge2 = parseSpanishNumber(currentRow[25]);
            prevRow[25] = (surcharge1 + surcharge2).toString();
            const abonado1 = parseSpanishNumber(prevRow[24]);
            const abonado2 = parseSpanishNumber(currentRow[24]);
            prevRow[24] = (abonado1 + abonado2).toString();
            const pending1 = parseSpanishNumber(prevRow[29]);
            const pending2 = parseSpanishNumber(currentRow[29]);
            prevRow[29] = (pending1 + pending2).toString();
            // Concatenate products
            let emptyIdx = 30;
            while ((prevRow[emptyIdx] || "").trim() !== "" && (prevRow[emptyIdx] || "").trim() !== "0") {
                emptyIdx += 4;
            }
            for (let pIdx = 30; pIdx < currentRow.length; pIdx += 4) {
                const prodName = (currentRow[pIdx] || "").trim();
                const prodQty = (currentRow[pIdx + 1] || "").trim();
                const prodPrice = (currentRow[pIdx + 2] || "").trim();
                const prodSubt = (currentRow[pIdx + 3] || "").trim();
                if (prodName && prodName !== "0" && prodName.toLowerCase() !== "descuento") {
                    prevRow[emptyIdx] = prodName;
                    prevRow[emptyIdx + 1] = prodQty;
                    prevRow[emptyIdx + 2] = prodPrice;
                    prevRow[emptyIdx + 3] = prodSubt;
                    emptyIdx += 4;
                }
            }
        }
        else {
            merged.push(currentRow);
        }
    }
    return merged;
};
