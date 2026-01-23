sap.ui.define([
    "sap/ui/model/json/JSONModel"
], (JSONModel) => {
    "use strict";

    return {
        /**
         * Tạo Global Data Model với dữ liệu mock đa dạng
         */
        createDataModel() {
            const oData = {
                // Upload History - Lịch sử upload của Nhân viên
                uploadHistory: [
                    {
                        id: "UPL001",
                        fileName: "DonHang_2026_01_15.xlsx",
                        uploadTime: "2026-01-15 09:23:45",
                        recordCount: 28,
                        statusText: "Thành công",
                        statusState: "Success",
                        approvalText: "Đã duyệt",
                        approvalState: "Success",
                        rejectionReason: ""
                    },
                    {
                        id: "UPL002",
                        fileName: "PO_Hardware_Jan2026.xlsx",
                        uploadTime: "2026-01-16 14:12:33",
                        recordCount: 45,
                        statusText: "Đang xử lý",
                        statusState: "Information",
                        approvalText: "Chờ duyệt",
                        approvalState: "Warning",
                        rejectionReason: ""
                    },
                    {
                        id: "UPL003",
                        fileName: "LinhKien_Q1_2026.xlsx",
                        uploadTime: "2026-01-17 11:05:12",
                        recordCount: 32,
                        statusText: "Thất bại",
                        statusState: "Error",
                        approvalText: "Bị từ chối",
                        approvalState: "Error",
                        rejectionReason: "Thiếu thông tin đơn giá tại dòng 15, 18, 24"
                    }
                ],

                // Pending Orders - Đơn hàng chờ duyệt
                pendingOrders: [
                    {
                        uploadId: "UPL002",
                        orderCode: "PO-2026-001234",
                        supplier: "Công ty TNHH Thiết bị Điện tử Việt Nam",
                        uploadBy: "Nguyễn Văn A",
                        uploadTime: "2026-01-16 14:12:33",
                        itemCount: 6,
                        priority: "Cao",
                        priorityState: "Error",
                        totalAmount: "245.750.000 VNĐ",
                        items: [
                            {
                                itemCode: "CPU-I9-13900K",
                                itemName: "Bộ vi xử lý Intel Core i9-13900K",
                                quantity: 10,
                                unit: "Cái",
                                unitPrice: "12.500.000 VNĐ",
                                totalPrice: "125.000.000 VNĐ"
                            },
                            {
                                itemCode: "RAM-DDR5-32GB",
                                itemName: "RAM DDR5 32GB Kingston Fury",
                                quantity: 20,
                                unit: "Thanh",
                                unitPrice: "4.250.000 VNĐ",
                                totalPrice: "85.000.000 VNĐ"
                            },
                            {
                                itemCode: "SSD-1TB-NVME",
                                itemName: "Ổ cứng SSD NVMe 1TB Samsung 980 Pro",
                                quantity: 15,
                                unit: "Cái",
                                unitPrice: "2.350.000 VNĐ",
                                totalPrice: "35.250.000 VNĐ"
                            }
                        ]
                    },
                    {
                        uploadId: "UPL006",
                        orderCode: "PO-2026-001235",
                        supplier: "Công ty Cổ phần Công nghệ ABC",
                        uploadBy: "Nguyễn Văn A",
                        uploadTime: "2026-01-18 10:22:18",
                        itemCount: 4,
                        priority: "Trung bình",
                        priorityState: "Warning",
                        totalAmount: "158.500.000 VNĐ",
                        items: [
                            {
                                itemCode: "MON-27-4K",
                                itemName: "Màn hình Dell 27 inch 4K UltraSharp",
                                quantity: 25,
                                unit: "Cái",
                                unitPrice: "5.800.000 VNĐ",
                                totalPrice: "145.000.000 VNĐ"
                            },
                            {
                                itemCode: "KB-MX-RGB",
                                itemName: "Bàn phím cơ Mechanical RGB",
                                quantity: 30,
                                unit: "Cái",
                                unitPrice: "450.000 VNĐ",
                                totalPrice: "13.500.000 VNĐ"
                            }
                        ]
                    }
                ],

                // System Logs
                systemLogs: [
                    {
                        logTime: "2026-01-19 10:23:15",
                        logType: "Mapping",
                        severity: "Error",
                        severityState: "Error",
                        userName: "Nguyễn Văn A",
                        message: "Không tìm thấy cột 'Đơn giá'",
                        duration: "0.05s"
                    },
                    {
                        logTime: "2026-01-18 16:47:30",
                        logType: "Processing",
                        severity: "Success",
                        severityState: "Success",
                        userName: "System",
                        message: "Mapping thành công 19 dòng",
                        duration: "1.82s"
                    }
                ]
            };

            return new JSONModel(oData);
        }
    };
});