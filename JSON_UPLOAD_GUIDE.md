# 📋 JSON Upload Feature - Hướng dẫn sử dụng

## 🎯 Tổng quan

Tính năng **JSON Upload** cho phép bạn gửi dữ liệu order lên SAP CPI bằng cách nhập JSON trực tiếp hoặc upload file .json. Đây là giải pháp lý tưởng cho:

- ✅ API Integration (system-to-system)
- ✅ Developers & Technical users
- ✅ Automated batch processing
- ✅ Testing & debugging

---

## 🚀 Tính năng chính

### 1. **Dual Mode Upload**
- Tab **Excel Upload**: Upload file .xlsx (existing feature)
- Tab **JSON Upload**: Paste JSON hoặc upload file .json (**NEW**)

### 2. **JSON Editor**
- Code editor với monospace font
- Dark theme (giống VS Code)
- Paste trực tiếp hoặc upload file
- Syntax highlighting ready

### 3. **Validation**
- Kiểm tra JSON format
- Validate structure: `{ "orders": [...] }`
- Check required fields cho mỗi order
- Hiển thị lỗi chi tiết

### 4. **Preview Table**
- Xem trước data dạng bảng
- Review trước khi gửi CPI
- Hiển thị số lượng orders

### 5. **CPI Integration**
- Tương tự Excel upload
- Sequential processing
- Tạo: Sales Order → Delivery → Billing
- Real-time progress tracking

---

## 📝 JSON Format

### **Cấu trúc bắt buộc:**

```json
{
  "orders": [
    {
      "DocType": "OR1",
      "Material": "HEADPHONE_10",
      "Quantity": 10,
      "Plant": "UP24",
      "SoldToParty": "1003209",
      "SalesOrg": "FU24"
    }
  ]
}
```

### **Các trường bắt buộc:**

| Field | Type | Description |
|-------|------|-------------|
| `DocType` | String | Loại chứng từ (OR1, OR2, etc.) |
| `Material` | String | Mã vật tư |
| `Quantity` | Number | Số lượng |
| `Plant` | String | Mã nhà máy |
| `SoldToParty` | String | Mã khách hàng |
| `SalesOrg` | String | Tổ chức bán hàng (optional, default: FU24) |

### **Các trường tùy chọn:**

```json
{
  "PO": "",
  "Channel": "FU",
  "SalesDistrict": "",
  "Division": "FP",
  "Incoterms1": "FOR",
  "Incoterms2": "Miami",
  "PaymentTerms": "0001",
  "ShipToParty": "1003209",
  "BillToParty": "1003209",
  "Payer": "1003209",
  "StorageLoc": "Yard",
  "PriceDate": "2024-02-19",
  "ReqDate": "2024-02-19",
  "ReqTime": "12:30:00",
  "TestRun": ""
}
```

---

## 🎬 Hướng dẫn sử dụng

### **Bước 1: Chuyển sang JSON Mode**
1. Vào trang **Upload**
2. Click tab **JSON Upload**

### **Bước 2: Nhập dữ liệu JSON**

**Option A: Paste trực tiếp**
1. Copy JSON data từ source của bạn
2. Paste vào JSON Editor

**Option B: Upload file .json**
1. Click button **"Upload .json File"**
2. Chọn file từ máy tính
3. File sẽ tự động load vào editor

**Option C: Download Sample**
1. Click button **"Sample"** (góc phải)
2. Download file `sample_orders.json`
3. Edit file theo nhu cầu
4. Upload lại

### **Bước 3: Validate JSON**
1. Click button **"Validate JSON"**
2. Hệ thống sẽ kiểm tra:
   - JSON format hợp lệ
   - Có cấu trúc `{ "orders": [...] }`
   - Các trường bắt buộc đầy đủ
3. Kết quả hiển thị:
   - ✅ **Success**: "JSON hợp lệ - Tìm thấy X orders"
   - ❌ **Error**: Hiển thị lỗi chi tiết

### **Bước 4: Preview dữ liệu**
- Sau khi validate thành công
- Bảng preview tự động hiển thị
- Review các orders trước khi gửi

### **Bước 5: Gửi lên SAP CPI**
1. Click button **"Gửi tới SAP CPI"**
2. Confirm dialog xuất hiện
3. Click **OK** để xử lý
4. Theo dõi progress:
   - Busy dialog hiển thị tiến độ
   - Processing từng order tuần tự
5. Xem kết quả:
   - Results table hiển thị
   - Sales Order, Delivery, Billing numbers
   - Trạng thái mỗi order (Success/Error)

---

## 💡 Tips & Best Practices

### **1. Testing**
- Sử dụng sample JSON để test
- Bắt đầu với 1-2 orders trước
- Kiểm tra kết quả trước khi scale up

### **2. Data Preparation**
- Đảm bảo Material codes hợp lệ trong SAP
- Customer numbers phải tồn tại
- Plant codes phải đúng

### **3. Error Handling**
- Nếu validation fail, đọc message lỗi carefully
- Check JSON syntax online: jsonlint.com
- Kiểm tra required fields

### **4. Performance**
- JSON upload xử lý tuần tự (sequential)
- Tối ưu cho 10-50 orders/batch
- Với số lượng lớn (>100), chia nhỏ batches

### **5. Use Cases**

**JSON Upload phù hợp cho:**
- API integration từ hệ thống khác
- Automated scripts/jobs
- Testing & development
- Technical users

**Excel Upload phù hợp cho:**
- Business users
- Manual data entry
- Bulk import từ spreadsheet
- Non-technical users

---

## 🔧 Technical Details

### **Files Modified:**

1. **Upload.view.xml**
   - Added SegmentedButton for tab navigation
   - Added JSON Upload section with editor
   - Preview table for JSON data

2. **Upload.controller.js**
   - `onUploadModeChange()`: Switch between Excel/JSON
   - `onValidateJSON()`: JSON validation logic
   - `onUploadJSONFile()`: File upload handler
   - `onDownloadJSONSample()`: Generate sample file
   - `onClearJSON()`: Reset JSON state
   - `onSendJSONToCPI()`: Send JSON orders to CPI
   - `_sendJSONToCPI()`: Process orders sequentially
   - `_resetJSONState()`: Reset all JSON properties

3. **premium_upload.css**
   - JSON editor styling (dark theme)
   - Tab bar styling
   - Feature items & sample box styling

### **Model Properties Added:**

```javascript
{
  uploadMode: "excel" | "json",  // Current tab
  jsonInput: "",                  // JSON editor content
  jsonValidationVisible: false,   // Show validation message
  jsonValidationText: "",         // Validation message
  jsonValidationType: "None",     // Success/Error/Warning
  jsonTableVisible: false,        // Show preview table
  jsonTableData: [],              // Preview data array
  jsonCanExecute: false          // Enable CPI button
}
```

---

## 📊 Sample JSON Files

### **Single Order:**
```json
{
  "orders": [
    {
      "DocType": "OR1",
      "Material": "HEADPHONE_10",
      "Quantity": 10,
      "Plant": "UP24",
      "SoldToParty": "1003209",
      "SalesOrg": "FU24",
      "Channel": "FU",
      "Division": "FP",
      "StorageLoc": "Yard"
    }
  ]
}
```

### **Multiple Orders:**
```json
{
  "orders": [
    {
      "DocType": "OR1",
      "Material": "HEADPHONE_10",
      "Quantity": 10,
      "Plant": "UP24",
      "SoldToParty": "1003209"
    },
    {
      "DocType": "OR1",
      "Material": "LAPTOP_15",
      "Quantity": 5,
      "Plant": "UP24",
      "SoldToParty": "1003209"
    },
    {
      "DocType": "OR1",
      "Material": "MOUSE_WIRELESS",
      "Quantity": 20,
      "Plant": "UP24",
      "SoldToParty": "1003209"
    }
  ]
}
```

---

## 🐛 Troubleshooting

### **Lỗi: "JSON không hợp lệ"**
- Check JSON syntax (comma, brackets, quotes)
- Use online validator: jsonlint.com
- Ensure proper encoding (UTF-8)

### **Lỗi: "JSON phải có cấu trúc { 'orders': [...] }"**
- Root object phải có key `"orders"`
- Value phải là array
- Example: `{ "orders": [] }`

### **Lỗi: "Order #X thiếu trường bắt buộc: Material"**
- Kiểm tra order thứ X trong array
- Đảm bảo tất cả required fields có mặt
- Field names phải match exactly (case-sensitive)

### **Lỗi CPI: HTTP 500**
- Data không hợp lệ trong SAP
- Material/Customer không tồn tại
- Check SAP master data

---

## ✅ Checklist

Trước khi gửi JSON lên CPI:

- [ ] JSON đã được validate thành công
- [ ] Preview table hiển thị đúng data
- [ ] Số lượng orders như mong đợi
- [ ] Material codes hợp lệ
- [ ] Customer numbers đúng
- [ ] Plant codes tồn tại trong SAP
- [ ] Đã test với sample nhỏ trước

---

## 🎓 Next Steps

1. **Test với sample JSON**
   - Download sample file
   - Validate & preview
   - Gửi thử 1 order

2. **Integrate với hệ thống**
   - Generate JSON từ API
   - Upload programmatically
   - Monitor results

3. **Scale up**
   - Batch processing
   - Error handling
   - Automation

---

## 📞 Support

Nếu gặp vấn đề:
1. Check validation messages
2. Review JSON structure
3. Test với sample data
4. Check SAP master data
5. Contact admin nếu cần

---

**Version:** 1.0  
**Last Updated:** February 19, 2026  
**Author:** GitHub Copilot
