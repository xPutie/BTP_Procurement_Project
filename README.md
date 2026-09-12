# SAP BTP Procurement & Sales Automation Platform

[![SAP BTP](https://img.shields.io/badge/SAP%20BTP-Cloud%20Foundry-008FD3?style=flat&logo=sap)](https://cloudplatform.sap.com)
[![SAP CAP](https://img.shields.io/badge/SAP%20CAP-Node.js-blue?style=flat&logo=node.js)](https://cap.cloud.sap)
[![SAP UI5](https://img.shields.io/badge/SAP%20UI5-Fiori%20Horizon-orange?style=flat&logo=sap)](https://ui5.sap.com)
[![SAP CPI](https://img.shields.io/badge/SAP%20CPI-Integration%20Suite-0072C6?style=flat&logo=sap)](https://cloudplatform.sap.com)

Dự án Capstone tự động hóa quy trình **Procurement (MM)** và **Sales (SD)** trên nền tảng **SAP Business Technology Platform (BTP)**, kết hợp **SAP Cloud Application Programming Model (CAP)**, giao diện **SAP Fiori / SAPUI5**, và **SAP Integration Suite (CPI)** để tích hợp với hệ thống **SAP S/4HANA**.

---

## 📌 Tóm Tắt Hệ Thống (System Overview)

Hệ thống cho phép người dùng tải lên danh sách đơn hàng (qua file **Excel / JSON**), thực hiện ánh xạ dữ liệu thông minh (Data Mapping), sau đó tự động hóa quy trình tạo chứng từ trong hệ thống ERP thông qua SAP CPI (Cloud Integration).

Hệ thống hỗ trợ 2 chuỗi quy trình chính:
1. **SD Full Chain (Sales & Distribution)**: Khởi tạo Sales Order (SO) ➔ Outbound Delivery ➔ Billing Document.
2. **MM Full Chain (Materials Management)**: Khởi tạo Purchase Requisition (PR) ➔ Purchase Order (PO).

---

## 🏗 Kiến Trúc Hệ Thống (Architecture)

```text
┌─────────────────────────────────────────────────────────┐
│                      USER INTERFACE                     │
│    SAP Fiori / UI5 App (Horizon Theme, Dark Mode UI)    │
│            Upload Excel/JSON | Monitor | Approval       │
└────────────────────────────┬────────────────────────────┘
                             │ OData V4 / HTTP REST
┌────────────────────────────▼────────────────────────────┐
│                    CAP BACKEND SERVICE                  │
│       Node.js (@sap/cds), SAP HANA Cloud / SQLite        │
│          Data Validation, Parsing & State Engine        │
└────────────────────────────┬────────────────────────────┘
                             │ REST API (OAuth 2.0 / Basic)
┌────────────────────────────▼────────────────────────────┐
│               SAP INTEGRATION SUITE (CPI)               │
│                    Unified Integration Hub              │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Main Dispatcher (Router, Content Splitter)        │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ Connectors: Order, Delivery, Billing, PR, PO      │  │
│  └───────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────┘
                             │ BAPI / OData / RFC
┌────────────────────────────▼────────────────────────────┐
│                     SAP S/4HANA ERP                     │
└─────────────────────────────────────────────────────────┘
```

---

## ✨ Tính Năng Nổi Bật (Key Features)

- 📥 **Smart Bulk Upload**: Hỗ trợ nhập liệu số lượng lớn từ Excel (`.xlsx`) hoặc `JSON` với giao diện Preview & Data Validation trước khi đưa vào hệ thống.
- ⚡ **Auto Data Mapping**: Tự động nhận diện cấu trúc file, chuẩn hóa mã vật tư (Material), khách hàng (Customer), nhà cung cấp (Vendor) và nhà máy (Plant).
- 🔄 **Quy Trình Phê Duyệt (Approval Workflow)**: Cơ chế duyệt đơn từ Sales Team, Warehouse, Purchasing Group trước khi chính thức tạo chứng từ trên S/4HANA.
- 🔗 **CPI Integration Suite Hub**: Tự động điều hướng và kích hoạt các iFlows tương ứng trên SAP CPI để tạo chứng từ nối tiếp (Chained document creation).
- 📊 **Real-time Processing Monitor**: Theo dõi tiến trình xử lý đơn hàng theo thời gian thực với đầy đủ log chi tiết từ CPI & S/4HANA.

---

## 🛠 Công Nghệ Sử Dụng (Tech Stack)

| Thành phần | Công nghệ |
| :--- | :--- |
| **Frontend** | SAPUI5 / SAP Fiori (Horizon Theme), JavaScript |
| **Backend Framework** | SAP CAP (Cloud Application Programming Framework - Node.js) |
| **Database** | SAP HANA Cloud (Production) / SQLite3 (Development) |
| **Middleware / Integration** | SAP Cloud Integration (CPI) / SAP Integration Suite |
| **Deployment / MTA** | SAP BTP Cloud Foundry, Cloud MTA Build Tool (`mta.yaml`) |
| **Security & Auth** | SAP XSUAA (JSON Web Tokens / OAuth 2.0), App Router |

---

## 📁 Cấu Trúc Thư Mục (Project Structure)

```text
BTP_Procurement_Project/
├── app/
│   ├── procurement/        # SAPUI5 Frontend App (Upload, Monitor, Approval)
│   └── router/             # App Router & XSUAA configuration
├── srv/                    # CAP Service definitions (service.cds, service.js)
├── db/                     # CDS Data models & SQLite/HANA tables
├── cpi/                    # Groovy Scripts & CPI iFlow helper files
├── docs/                   # Tài liệu hướng dẫn & tài liệu tích hợp CPI
├── scripts/                # Utility scripts (clean, build, deploy, DB start)
├── mta.yaml                # Multi-Target Application descriptor cho SAP BTP
├── xs-security.json        # Cấu hình XSUAA Roles & Scopes
├── SETUP_GUIDE.md          # Hướng dẫn cấu hình chi tiết CPI & BTP
└── package.json            # Node.js dependencies & scripts
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Local (Quick Start)

### 1. Yêu cầu môi trường (Prerequisites)
- **Node.js**: `v18.x` hoặc `v20.x`
- **SAP CDS DK**: `npm i -g @sap/cds-dk`
- **UI5 CLI**: `npm i -g @ui5/cli`

### 2. Cài đặt Dependencies
```bash
npm install
```

### 3. Cấu hình biến môi trường (`.env`)
Tạo file `.env` tại thư mục gốc dựa trên `.env.template`:
```env
CPI_BASE_URL=https://<your-tenant>.integrationsuite.cfapps.eu10.hana.ondemand.com
CPI_SD_ENDPOINT=/http/sd-full-chain
CPI_MM_ENDPOINT=/http/mm-full-chain
CPI_USERNAME=<your-clientid>
CPI_PASSWORD=<your-clientsecret>
MOCK_S4=true
```

### 4. Chạy dự án ở môi trường Local
- **Chạy CAP Backend (Node.js + SQLite):**
  ```bash
  npm run watch
  ```
  *(Dịch vụ sẽ mở tại `http://localhost:4004`)*

- **Chạy song song cả Backend & Frontend (Full Local Dev):**
  ```bash
  npm run dev
  ```

---

## 📦 Build & Deploy lên SAP BTP (Cloud Foundry)

1. **Build MTA Archive:**
   ```bash
   mbt build
   ```
2. **Deploy lên SAP BTP Space:**
   ```bash
   cf deploy mta_archives/po_automation_ui_0.0.1.mtar
   ```
Hoặc sử dụng script tự động hóa được chuẩn bị sẵn:
```powershell
npm run clean-build-deploy
```

---

## 📄 Giấy Phép & Tác Giả (Author)

- **Dự án Capstone:** SAP BTP Procurement & Sales Process Automation
- **Nhà phát triển:** Nguyễn Mỹ Thái Hoà (`xPutie`)
- **Nền tảng:** SAP Business Technology Platform (BTP)
