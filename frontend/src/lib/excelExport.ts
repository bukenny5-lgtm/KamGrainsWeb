type ExcelCellType = "text" | "number" | "boolean" | "date" | "datetime";

export type ExcelColumn<Row> = {
  header: string;
  value: (row: Row, rowIndex: number) => unknown;
  width?: number;
  type?: ExcelCellType;
};

type ExcelSheet<Row> = {
  name: string;
  columns: ExcelColumn<Row>[];
  rows: Row[];
};

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeSheetName(name: string) {
  const trimmed = name.trim().replace(/[\\/?*\[\]:]/g, "-");
  return trimmed.slice(0, 31) || "Sheet1";
}

function formatSheetDimension(columns: number, rows: number) {
  const lastColumn = columnLetter(columns);
  return `${lastColumn}1:${lastColumn}${rows + 1}`;
}

function columnLetter(index: number) {
  let n = Math.max(1, index);
  let result = "";

  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }

  return result;
}

function encodeUtf8(value: string) {
  return new TextEncoder().encode(value);
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const merged = new Uint8Array(size);
  let offset = 0;

  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }

  return merged;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (~crc) >>> 0;
}

function toDosDateTime(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosDate = ((Math.max(year, 1980) - 1980) << 9) | (month << 5) | day;
  const dosTime = (hours << 11) | (minutes << 5) | seconds;

  return { dosDate, dosTime };
}

function createLocalFileHeader(
  nameBytes: Uint8Array,
  dataBytes: Uint8Array,
  crc: number,
  dosDate: number,
  dosTime: number
) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x04034b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 0x0800);
  writeUint16(view, 8, 0);
  writeUint16(view, 10, dosTime);
  writeUint16(view, 12, dosDate);
  writeUint32(view, 14, crc);
  writeUint32(view, 18, dataBytes.length);
  writeUint32(view, 22, dataBytes.length);
  writeUint16(view, 26, nameBytes.length);
  writeUint16(view, 28, 0);

  return header;
}

function createCentralDirectoryHeader(
  nameBytes: Uint8Array,
  dataBytes: Uint8Array,
  crc: number,
  offset: number,
  dosDate: number,
  dosTime: number
) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x02014b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 20);
  writeUint16(view, 8, 0x0800);
  writeUint16(view, 10, 0);
  writeUint16(view, 12, dosTime);
  writeUint16(view, 14, dosDate);
  writeUint32(view, 16, crc);
  writeUint32(view, 20, dataBytes.length);
  writeUint32(view, 24, dataBytes.length);
  writeUint16(view, 28, nameBytes.length);
  writeUint16(view, 30, 0);
  writeUint16(view, 32, 0);
  writeUint16(view, 34, 0);
  writeUint16(view, 36, 0);
  writeUint32(view, 38, 0);
  writeUint32(view, 42, offset);

  return header;
}

function createEndOfCentralDirectory(
  centralDirectorySize: number,
  centralDirectoryOffset: number,
  entryCount: number
) {
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);

  writeUint32(view, 0, 0x06054b50);
  writeUint16(view, 4, 0);
  writeUint16(view, 6, 0);
  writeUint16(view, 8, entryCount);
  writeUint16(view, 10, entryCount);
  writeUint32(view, 12, centralDirectorySize);
  writeUint32(view, 16, centralDirectoryOffset);
  writeUint16(view, 20, 0);

  return end;
}

function parseDateValue(value: unknown, type: ExcelCellType) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value);
  }

  if (typeof value !== "string" || !value) {
    return null;
  }

  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateToExcelSerial(value: Date) {
  const excelEpoch = Date.UTC(1899, 11, 30);
  return (value.getTime() - excelEpoch) / 86400000;
}

function cellXml(value: unknown, type?: ExcelCellType) {
  if (value === null || value === undefined || value === "") {
    return `<c t="inlineStr"><is><t/></is></c>`;
  }

  if (type === "number") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return `<c t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
    }

    return `<c><v>${numeric}</v></c>`;
  }

  if (type === "boolean") {
    return `<c t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  if (type === "date" || type === "datetime") {
    const parsed = parseDateValue(value, type);
    if (!parsed) {
      return `<c t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
    }

    const serial = dateToExcelSerial(parsed);
    const styleIndex = type === "date" ? 2 : 3;
    return `<c s="${styleIndex}"><v>${serial}</v></c>`;
  }

  return `<c t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
}

function buildSheetXml<Row>(sheet: ExcelSheet<Row>) {
  const rowsXml = [
    `<row r="1" ht="20" customHeight="1">${sheet.columns
      .map((column) => `<c t="inlineStr" s="1"><is><t>${escapeXml(column.header)}</t></is></c>`)
      .join("")}</row>`,
    ...sheet.rows.map((row, rowIndex) => {
      const rowNumber = rowIndex + 2;
      const cells = sheet.columns
        .map((column) => cellXml(column.value(row, rowIndex), column.type))
        .join("");

      return `<row r="${rowNumber}">${cells}</row>`;
    }),
  ].join("");

  const widths = sheet.columns
    .map(
      (column, index) =>
        column.width
          ? `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`
          : ""
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${formatSheetDimension(sheet.columns.length, sheet.rows.length)}"/>
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  ${widths ? `<cols>${widths}</cols>` : ""}
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
}

function buildWorkbookXml(sheetName: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function buildWorkbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="165" formatCode="yyyy-mm-dd"/>
    <numFmt numFmtId="166" formatCode="yyyy-mm-dd hh:mm"/>
  </numFmts>
  <fonts count="2">
    <font>
      <sz val="11"/>
      <color theme="1"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <color rgb="FF111827"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
  </fonts>
  <fills count="2">
    <fill>
      <patternFill patternType="none"/>
    </fill>
    <fill>
      <patternFill patternType="solid">
        <fgColor rgb="FFE5E7EB"/>
        <bgColor indexed="64"/>
      </patternFill>
    </fill>
  </fills>
  <borders count="1">
    <border>
      <left/>
      <right/>
      <top/>
      <bottom/>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function buildZip(entries: ZipEntry[]) {
  const now = new Date();
  const { dosDate, dosTime } = toDosDateTime(now);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encodeUtf8(entry.name);
    const crc = crc32(entry.data);
    const localHeader = createLocalFileHeader(nameBytes, entry.data, crc, dosDate, dosTime);
    localParts.push(localHeader, nameBytes, entry.data);

    const centralHeader = createCentralDirectoryHeader(
      nameBytes,
      entry.data,
      crc,
      offset,
      dosDate,
      dosTime
    );
    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + entry.data.length;
  }

  const localBlobParts = [...localParts];
  const centralDirectory = concatBytes(centralParts);
  const end = createEndOfCentralDirectory(centralDirectory.length, offset, entries.length);
  const toBlobPart = (bytes: Uint8Array): ArrayBuffer => {
    if (bytes.buffer instanceof ArrayBuffer) {
      return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer
        : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }

    return Uint8Array.from(bytes).buffer;
  };

  return new Blob(
    [...localBlobParts.map(toBlobPart), toBlobPart(centralDirectory), toBlobPart(end)],
    { type: XLSX_MIME }
  );
}

export function buildXlsxBlob<Row>(sheet: ExcelSheet<Row>) {
  const normalizedName = normalizeSheetName(sheet.name);
  const sheetXml = buildSheetXml(sheet);
  const workbookXml = buildWorkbookXml(normalizedName);
  const workbookRelsXml = buildWorkbookRelsXml();
  const rootRelsXml = buildRootRelsXml();
  const contentTypesXml = buildContentTypesXml();
  const stylesXml = buildStylesXml();

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encodeUtf8(contentTypesXml) },
    { name: "_rels/.rels", data: encodeUtf8(rootRelsXml) },
    { name: "xl/workbook.xml", data: encodeUtf8(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: encodeUtf8(workbookRelsXml) },
    { name: "xl/styles.xml", data: encodeUtf8(stylesXml) },
    { name: "xl/worksheets/sheet1.xml", data: encodeUtf8(sheetXml) },
  ];

  return buildZip(entries);
}

export async function downloadXlsx<Row>(options: {
  fileName: string;
  sheetName: string;
  rows: Row[];
  columns: ExcelColumn<Row>[];
}) {
  const blob = buildXlsxBlob({
    name: options.sheetName,
    rows: options.rows,
    columns: options.columns,
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = options.fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
