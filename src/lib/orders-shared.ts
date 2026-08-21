import { Timestamp } from "firebase/firestore";

// Converte um Order (com objetos Date) para um formato gravável no Firestore,
// pronto para ser lido depois pela página pública sem precisar de autenticação.
export function serializeOrderForPublicShare(order: Order) {
  return {
    orderId: order.id,
    quotationNumber: order.quotationNumber,
    internalOS: order.internalOS || '',
    projectName: order.projectName || '',
    customer: order.customer,
    status: order.status,
    deliveryDate: order.deliveryDate ? Timestamp.fromDate(order.deliveryDate) : null,
    totalWeight: order.totalWeight,
    items: order.items.map(item => ({
      code: item.code || '',
      description: item.description,
      quantity: item.quantity,
      unitWeight: item.unitWeight || 0,
      productionPlan: (item.productionPlan || []).map(stage => ({
        stageName: stage.stageName,
        status: stage.status,
        durationDays: stage.durationDays || 0,
        startDate: stage.startDate ? Timestamp.fromDate(stage.startDate) : null,
        completedDate: stage.completedDate ? Timestamp.fromDate(stage.completedDate) : null,
      })),
    })),
    updatedAt: Timestamp.now(),
  };
}

// Caminho inverso: reconstrói um Order utilizável pelo gerador de PDF
// a partir do documento público salvo no Firestore.
export function deserializeOrderFromPublicShare(data: any, fallbackId: string): Order {
  const items: OrderItem[] = Array.isArray(data.items)
    ? data.items.map((item: any) => ({
        code: item.code || '',
        description: item.description || '',
        quantity: item.quantity || 0,
        unitWeight: item.unitWeight || 0,
        productionPlan: (item.productionPlan || []).map((stage: any) => ({
          stageName: stage.stageName || '',
          status: stage.status || 'Pendente',
          durationDays: stage.durationDays || 0,
          startDate: safeToDate(stage.startDate),
          completedDate: safeToDate(stage.completedDate),
        })),
      }))
    : [];

  return {
    id: data.orderId || fallbackId,
    quotationId: '',
    quotationNumber: data.quotationNumber || 'N/A',
    internalOS: data.internalOS || '',
    projectName: data.projectName || '',
    customer: data.customer || { id: '', name: 'Cliente não informado' },
    items,
    totalValue: 0,
    totalWeight: data.totalWeight || calculateTotalWeight(items),
    status: data.status || '',
    createdAt: new Date(),
    deliveryDate: safeToDate(data.deliveryDate) || undefined,
    completedAt: undefined,
    dataBookSent: false,
    dataBookSentAt: undefined,
    driveLink: '',
    documents: { drawings: false, inspectionTestPlan: false, paintPlan: false },
  };
}
