import com.sap.gateway.ip.core.customdev.util.Message
import groovy.util.XmlSlurper
import groovy.json.JsonOutput
import java.io.Reader
import java.math.BigDecimal

def Message processData(Message message) {
    // 1. Đọc luồng XML bằng Reader
    Reader reader = message.getBody(Reader.class)
    if (!reader) return message
    
    // Parse XML
    def payload = new XmlSlurper().parse(reader)

    // 2. Lấy BatchID chung
    def batchNode = payload.'**'.find { it.name() == 'MyBatchID' && it.text() != '' }
    def batchID = batchNode ? batchNode.text() : (message.getHeaders().get("batch_ID") ?: "BATCH_" + System.currentTimeMillis())

    // Lấy FlowType từ Header (Order-to-Cash hoặc Make-to-Order)
    def flowTypeHeader = message.getHeaders().get("flowType")
    def localFlowType = flowTypeHeader ? flowTypeHeader.toString() : "Order-to-Cash"
    // Map old values to new ones if needed
    if (localFlowType == "Sales") localFlowType = "Order-to-Cash"
    if (localFlowType == "Procurement") localFlowType = "Make-to-Order"

    // 3. THU THẬP TẤT CẢ QUOTATION TỪ XML
    def allQuotations = []
    def wrappers = payload.'**'.findAll { it.name() == 'ResponseWrapper' }

    wrappers.each { wrapper ->
        wrapper.'**'.findAll { it.name() == 'EtResults' }.each { resultNode ->
            resultNode.item.each { itm ->
                allQuotations << [
                    qtNode: itm,
                    flowType: localFlowType
                ]
            }
        }
    }

    // 4. GOM NHÓM THEO KHÁCH HÀNG (SOLD-TO)
    // Những Quotation nào cùng mã SoldTo sẽ vào chung 1 list
    def groupedQuotations = allQuotations.groupBy { it.qtNode.SoldTo.text().trim() }

    def sbpaRequests = []

    // 5. XỬ LÝ VÀ TÍNH TIỀN CHO TỪNG KHÁCH HÀNG
    groupedQuotations.each { soldTo, items ->
        def flatQuotationList = []
        def totalBatchNetValue = 0
        def totalBatchTax = 0
        def totalBatchGross = 0
        def customerName = ""
        def totalOrders = items.size() // Chỉ đếm số đơn của khách này

        items.each { itemMap ->
            def qtNode = itemMap.qtNode
            def flowType = itemMap.flowType

            def qtNum = qtNode.Quotation.text()
            if (!customerName && qtNode.SoldToName.text()) {
                customerName = qtNode.SoldToName.text()
            }

            def orderNet = parseNumber(qtNode.NetValue.text())
            def orderTax = parseNumber(qtNode.TaxAmount.text())
            def orderGross = parseNumber(qtNode.GrossValue.text())

            totalBatchNetValue += orderNet
            totalBatchTax += orderTax
            totalBatchGross += orderGross

            qtNode.ItItems.item.each { itemNode ->
                def flatItem = [:]
                
                flatItem.salesUnit = itemNode.SalesUnit.text()
                flatItem.netPrice = parseNumber(itemNode.NetPrice.text())
                flatItem.quotationNo = qtNum
                flatItem.soldTo = soldTo
                flatItem.material = itemNode.Material.text()
                flatItem.quantity = parseNumber(itemNode.Quantity.text())
                flatItem.taxAmount = orderTax 
                flatItem.currency = itemNode.Currency.text() ?: qtNode.Currency.text()
                flatItem.totalValue = parseNumber(itemNode.ItemValue.text()) 
                flatItem.materialDescription = itemNode.MatDesc.text()
                
                flatItem.batch_id = batchID
                flatItem.flow_type = flowType 
                flatItem.total_orders = totalOrders 
                
                flatQuotationList.add(flatItem)
            }
        }

        def batchObject = [
            batchID: batchID,
            customer: customerName ?: "",
            totalOrders: totalOrders,
            Net_Value: totalBatchNetValue,
            Tax_Amount: totalBatchTax,
            Gross_Amount: totalBatchGross,
            Discount: 0,
            quotationList: flatQuotationList
        ]

        // Đóng gói thành 1 request độc lập cho khách hàng này
        sbpaRequests << [
            definitionId: "us10.trial-2-5pxafgim.salesorderapprovalprocess4.salesOrderApprovalProcess",
            context: [
                salesOrderData: [ batchObject ]
            ]
        ]
    }

    // 6. XUẤT RA TỪNG DÒNG JSON (LINE BREAK TRICK)
    // Chuyển từng Object thành 1 chuỗi JSON riêng biệt
    def jsonLines = sbpaRequests.collect { JsonOutput.toJson(it) }
    
    // Nối các chuỗi này lại với nhau, cách nhau bằng dấu xuống dòng (\n)
    def finalPayload = jsonLines.join('\n')

    message.setBody(finalPayload)
    message.setHeader("Content-Type", "application/json") 
    
    return message
}

def parseNumber(String val) {
    if (!val || val.trim() == "") return 0
    try {
        return new BigDecimal(val.trim())
    } catch (Exception e) {
        return 0
    }
}
