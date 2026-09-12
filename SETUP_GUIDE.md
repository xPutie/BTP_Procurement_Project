# SAP BTP Procurement Project - CPI Integration Guide

## 📋 Quick Start Checklist

### ✅ Phase 1: CPI Setup (In Integration Suite)
- [ ] Create **Billing_Connector_S4** iFlow
- [ ] Create **PR_Connector_S4** iFlow  
- [ ] Create **PO_Connector_S4** iFlow
- [ ] Update **Main_Dispatcher** to call all connectors
- [ ] Deploy all iFlows
- [ ] Test with Simulate feature

### ✅ Phase 2: BTP Configuration
- [ ] Create Service Instance for Integration Suite
- [ ] Create Service Key
- [ ] Copy credentials to `.env` file
- [ ] Create Destination `CPI_INTEGRATION` in BTP Cockpit
- [ ] Test destination connectivity

### ✅ Phase 3: SAP BAS Project Setup
- [ ] Run `npm install` to get axios dependency
- [ ] Copy `.env.template` to `.env`
- [ ] Fill in CPI credentials in `.env`
- [ ] Update `service.cds` (already done ✅)
- [ ] Update `service.js` (already done ✅)
- [ ] Update `Upload.controller.js` (already done ✅)

### ✅ Phase 4: Testing
- [ ] Test Excel upload → Parse → Store in DB
- [ ] Test CPI call from CAP (using Postman or UI)
- [ ] Test SD Full Chain (SO → Delivery → Billing)
- [ ] Test MM Full Chain (SO → PR → PO)
- [ ] Check CPI Message Monitoring
- [ ] Verify error handling

### ✅ Phase 5: Documentation for Defense
- [ ] Screenshot CPI Dashboard
- [ ] Screenshot Message Monitoring
- [ ] Document API endpoints
- [ ] Create architecture diagram with CPI
- [ ] Prepare demo script

---

## 🎯 What You Need to Provide to SAP BAS

### 1. Environment Variables (via `.env` file)

Create `.env` in project root:
```env
CPI_BASE_URL=https://<your-tenant>.integrationsuite.cfapps.eu10.hana.ondemand.com
CPI_SD_ENDPOINT=/http/sd-full-chain
CPI_MM_ENDPOINT=/http/mm-full-chain
CPI_USERNAME=<your-clientid>
CPI_PASSWORD=<your-clientsecret>
MOCK_S4=true
```

### 2. CPI Service Credentials

Get from BTP Cockpit → Service Keys:
```json
{
  "clientid": "sb-clone-xxx",
  "clientsecret": "yyy",
  "tokenurl": "https://xxx.authentication.eu10.hana.ondemand.com/oauth/token",
  "url": "https://xxx.integrationsuite.cfapps.eu10.hana.ondemand.com"
}
```

### 3. CPI Endpoint URLs

After deploying iFlows, copy the HTTP endpoint URLs:
- SD Full Chain: `https://<tenant>.integrationsuite.../http/sd-full-chain`
- MM Full Chain: `https://<tenant>.integrationsuite.../http/mm-full-chain`

### 4. Dependencies

Already added in `package.json`:
```json
"dependencies": {
  "axios": "^1.6.0"
}
```

Run: `npm install`

---

## 🔧 CPI iFlows You Need to Create

### 1. Billing_Connector_S4

**Purpose**: Create Billing Document from Delivery

**Input**:
```json
{
  "deliveryNumber": "8000012345",
  "billingDate": "2026-02-17"
}
```

**Output**:
```json
{
  "billingDocument": "9000012345",
  "status": "SUCCESS"
}
```

**Steps**:
1. Content Modifier - Extract delivery number
2. JSON to XML Converter
3. Message Mapping - BAPI format
4. Request Reply - Call BAPI_BILLINGDOC_CREATEFROMDATA (or mock endpoint)
5. XML to JSON Converter
6. Content Modifier - Format response

### 2. PR_Connector_S4

**Purpose**: Create Purchase Requisition

**Input**:
```json
{
  "prType": "NB",
  "items": [{
    "material": "MAT-001",
    "quantity": 10,
    "plant": "1000"
  }]
}
```

**Output**:
```json
{
  "purchaseRequisition": "1000012345",
  "status": "SUCCESS"
}
```

### 3. PO_Connector_S4

**Purpose**: Create Purchase Order from PR

**Input**:
```json
{
  "prNumber": "1000012345",
  "vendor": "VENDOR-001"
}
```

**Output**:
```json
{
  "purchaseOrder": "4500012345",
  "status": "SUCCESS"
}
```

---

## 🚀 Testing Flow

### Test 1: Upload Excel → CPI Processing

1. Open UI5 app: `http://localhost:4004/app/procurement/webapp/`
2. Navigate to Upload page
3. Upload sample Excel file
4. Click "Thực hiện Ánh xạ Chiến lược"
5. Select "Yes" for CPI processing
6. Check console for CPI call logs
7. Go to CPI → Monitor Message Processing
8. Verify messages processed successfully

### Test 2: Direct CPI Call (Postman)

**Request**:
```http
POST https://<tenant>.integrationsuite.../http/sd-full-chain
Authorization: Basic <base64(clientid:clientsecret)>
Content-Type: application/json

{
  "customer": "0001000001",
  "salesOrg": "1000",
  "distributionChannel": "10",
  "division": "00",
  "items": [
    {
      "material": "MAT-001",
      "quantity": 10,
      "unit": "EA",
      "price": 100.00,
      "plant": "1000"
    }
  ]
}
```

**Expected Response**:
```json
{
  "salesOrder": "0000012345",
  "delivery": "8000012345",
  "billing": "9000012345",
  "status": "SUCCESS",
  "timestamp": "2026-02-17T10:30:00Z"
}
```

---

## 📊 For Thesis Defense

### Architecture Diagram to Show:

```
┌─────────────┐
│   UI5 App   │ (Upload Excel/CSV/JSON)
└──────┬──────┘
       │ HTTP
┌──────▼──────┐
│  CAP (BAS)  │ (Parse, Validate, Store in HANA)
└──────┬──────┘
       │ REST API
┌──────▼──────────────────────────┐
│  SAP CPI (Integration Suite)     │ ◄── UNIFIED HUB
│  ┌────────────────────────────┐ │
│  │ Main Dispatcher            │ │
│  │  ├─ Router (JSON/CSV)      │ │
│  │  ├─ Content Splitter       │ │
│  │  └─ Approval Check         │ │
│  ├────────────────────────────┤ │
│  │ Order Connector S4         │ │
│  │ Delivery Connector S4      │ │
│  │ Billing Connector S4       │ │
│  │ PR Connector S4            │ │
│  │ PO Connector S4            │ │
│  └────────────────────────────┘ │
└──────┬───────────────────────────┘
       │ RFC/OData/SOAP
┌──────▼──────┐
│ SAP S/4HANA │ (or Mock Service)
└─────────────┘
```

### Key Points to Mention:

1. ✅ **"Unified Hub"** = CPI orchestrates all integrations
2. ✅ **"Receive through APIs"** = REST endpoints in CPI
3. ✅ **"JSON/CSV support"** = Router in Main Dispatcher
4. ✅ **"Multi-phase creation"** = Chained connectors (SO→Delivery→Billing)
5. ✅ **"Error handling"** = Built-in retry & monitoring
6. ✅ **"Scalability"** = CPI handles parallel processing

---

## 🎓 Demo Script for Defense

**Minute 1-2**: Show architecture diagram  
**Minute 3-5**: Live demo - Upload Excel → CPI processing  
**Minute 6-7**: Show CPI dashboard with message monitoring  
**Minute 8-9**: Show created documents (SO, Delivery, Billing)  
**Minute 10**: Q&A - Show code integration points

---

## 📝 Next Steps

1. **This week**: Create missing CPI connectors
2. **Next week**: Full integration testing
3. **Week after**: Documentation & demo preparation
4. **Defense day**: Confident presentation with live demo

Good luck! 🚀
