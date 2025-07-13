// Página/Componente para processar apontamentos via QR Code
// Arquivo: /pages/apontamento.tsx ou /components/AppointmentPage.tsx

"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  CheckCircle, 
  PlayCircle, 
  Clock, 
  MapPin, 
  Camera,
  User,
  Calendar,
  Package,
  AlertTriangle,
  Smartphone,
  QrCode
} from "lucide-react";
import { format } from "date-fns";

interface AppointmentData {
  orderId: string;
  itemId: string;
  stageIndex: number;
  stageName: string;
  action: 'start' | 'finish';
  baseUrl: string;
}

interface OperatorInfo {
  id: string;
  name: string;
  email?: string;
}

export default function AppointmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [appointmentData, setAppointmentData] = useState<AppointmentData | null>(null);
  const [operatorInfo, setOperatorInfo] = useState<OperatorInfo>({
    id: '',
    name: '',
    email: ''
  });
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderInfo, setOrderInfo] = useState<any>(null);
  const [currentLocation, setCurrentLocation] = useState<string>('');
  const [photoBase64, setPhotoBase64] = useState<string>('');

  // Carregar dados do QR Code
  useEffect(() => {
    const dataParam = searchParams.get('data');
    if (dataParam) {
      try {
        const decoded = JSON.parse(decodeURIComponent(dataParam));
        setAppointmentData(decoded);
        loadOrderInfo(decoded.orderId, decoded.itemId);
      } catch (error) {
        console.error('Erro ao decodificar QR Code:', error);
        toast({
          variant: "destructive",
          title: "QR Code inválido",
          description: "Não foi possível ler os dados do QR Code.",
        });
      }
    }
  }, [searchParams]);

  // Carregar informações do pedido
  const loadOrderInfo = async (orderId: string, itemId: string) => {
    try {
      const orderRef = doc(db, "companies", "mecald", "orders", orderId);
      const orderSnap = await getDoc(orderRef);
      
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        const item = orderData.items?.find((item: any) => item.id === itemId);
        
        setOrderInfo({
          order: {
            quotationNumber: orderData.quotationNumber,
            customer: orderData.customer,
            internalOS: orderData.internalOS,
          },
          item: item
        });
      }
    } catch (error) {
      console.error('Erro ao carregar pedido:', error);
    }
  };

  // Obter localização atual
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
        },
        () => setCurrentLocation('Localização não disponível')
      );
    }
  }, []);

  // Processar apontamento
  const handleSubmitAppointment = async () => {
    if (!appointmentData || !operatorInfo.name.trim()) {
      toast({
        variant: "destructive",
        title: "Dados incompletos",
        description: "Por favor, preencha seu nome para continuar.",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const result = await processAppointment(appointmentData, {
        ...operatorInfo,
        id: operatorInfo.id || `operator_${Date.now()}`,
      });

      // Salvar dados adicionais se fornecidos
      if (notes || photoBase64) {
        const appointmentId = `${appointmentData.orderId}_${appointmentData.itemId}_${appointmentData.stageIndex}_${appointmentData.action}_${Date.now()}`;
        await updateDoc(
          doc(db, "companies", "mecald", "appointments", appointmentId),
          {
            notes: notes || null,
            photo: photoBase64 || null,
            location: currentLocation || null,
          }
        );
      }

      toast({
        title: "Apontamento registrado!",
        description: result.message,
      });

      // Redirecionar após sucesso
      setTimeout(() => {
        router.push('/success-appointment');
      }, 2000);

    } catch (error) {
      console.error('Erro ao registrar apontamento:', error);
      toast({
        variant: "destructive",
        title: "Erro ao registrar",
        description: "Não foi possível registrar o apontamento. Tente novamente.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Capturar foto
  const handleTakePhoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPhotoBase64(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    };
    
    input.click();
  };

  if (!appointmentData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <QrCode className="h-16 w-16 mx-auto mb-4 text-blue-600" />
            <CardTitle>Carregando Apontamento</CardTitle>
            <CardDescription>Processando dados do QR Code...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isStartAction = appointmentData.action === 'start';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Header */}
        <Card className="border-blue-200 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
            <div className="flex items-center gap-3">
              {isStartAction ? (
                <PlayCircle className="h-8 w-8" />
              ) : (
                <CheckCircle className="h-8 w-8" />
              )}
              <div>
                <CardTitle className="text-xl">
                  {isStartAction ? 'Iniciar Tarefa' : 'Finalizar Tarefa'}
                </CardTitle>
                <CardDescription className="text-blue-100">
                  {appointmentData.stageName}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          
          {orderInfo && (
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Pedido:</span>
                  <span>{orderInfo.order.quotationNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Cliente:</span>
                  <span>{orderInfo.order.customer?.name}</span>
                </div>
                <div className="flex items-center gap-2 md:col-span-2">
                  <span className="font-medium">Item:</span>
                  <span>{orderInfo.item?.description}</span>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Informações do operador */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Identificação do Operador
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="operatorName">Nome Completo *</Label>
              <Input
                id="operatorName"
                value={operatorInfo.name}
                onChange={(e) => setOperatorInfo(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Digite seu nome completo"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="operatorEmail">Email (opcional)</Label>
              <Input
                id="operatorEmail"
                type="email"
                value={operatorInfo.email}
                onChange={(e) => setOperatorInfo(prev => ({ ...prev, email: e.target.value }))}
                placeholder="seu.email@empresa.com"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Informações adicionais */}
        <Card>
          <CardHeader>
            <CardTitle>Informações Adicionais (Opcional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicione observações sobre a execução da tarefa..."
                className="mt-1"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Foto da Execução</Label>
              {photoBase64 ? (
                <div className="relative">
                  <img 
                    src={photoBase64} 
                    alt="Foto da tarefa" 
                    className="w-full h-48 object-cover rounded border"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPhotoBase64('')}
                    className="absolute top-2 right-2"
                  >
                    Remover
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTakePhoto}
                  className="w-full"
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Tirar Foto
                </Button>
              )}
            </div>

            {currentLocation && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>Localização: {currentLocation}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumo e confirmação */}
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Resumo do Apontamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Ação:</span>
                <Badge variant={isStartAction ? "default" : "secondary"}>
                  {isStartAction ? 'Iniciar Tarefa' : 'Finalizar Tarefa'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Data/Hora:</span>
                <span>{format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Etapa:</span>
                <span>{appointmentData.stageName}</span>
              </div>
              {operatorInfo.name && (
                <div className="flex items-center justify-between">
                  <span className="font-medium">Operador:</span>
                  <span>{operatorInfo.name}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Botões de ação */}
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="flex-1"
            disabled={isProcessing}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmitAppointment}
            disabled={!operatorInfo.name.trim() || isProcessing}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Registrando...
              </>
            ) : (
              <>
                {isStartAction ? (
                  <PlayCircle className="mr-2 h-4 w-4" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Confirmar {isStartAction ? 'Início' : 'Conclusão'}
              </>
            )}
          </Button>
        </div>

        {/* Aviso importante */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 mb-1">Importante:</p>
                <ul className="text-amber-700 space-y-1 list-disc list-inside">
                  <li>Confirme que está executando a tarefa correta</li>
                  <li>O horário será registrado automaticamente</li>
                  <li>Este registro não pode ser desfeito</li>
                  {isStartAction && <li>Lembre-se de escanear o QR Code de conclusão ao terminar</li>}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Instruções para mobile */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Smartphone className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-800 mb-2">Dicas para melhor experiência:</p>
                <ul className="text-blue-700 space-y-1 list-disc list-inside">
                  <li>Mantenha a conexão com a internet ativa</li>
                  <li>Tire fotos com boa iluminação</li>
                  <li>Adicione observações relevantes para a equipe</li>
                  <li>Em caso de erro, contate a supervisão</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Página de sucesso após apontamento
export function AppointmentSuccessPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-green-800">Apontamento Registrado!</CardTitle>
          <CardDescription>
            Sua atividade foi registrada com sucesso no sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>Data/Hora: {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
          </div>
          <Separator />
          <div className="space-y-2">
            <Button
              onClick={() => router.push('/orders')}
              className="w-full"
            >
              Ver Pedidos
            </Button>
            <Button
              variant="outline"
              onClick={() => window.close()}
              className="w-full"
            >
              Fechar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Hook personalizado para histórico de apontamentos
export function useAppointmentHistory(orderId: string, itemId: string) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const appointmentsRef = collection(db, "companies", "mecald", "appointments");
        const q = query(
          appointmentsRef, 
          where("orderId", "==", orderId),
          where("itemId", "==", itemId),
          orderBy("timestamp", "desc")
        );
        
        const querySnapshot = await getDocs(q);
        const appointmentsList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate(),
        }));
        
        setAppointments(appointmentsList);
      } catch (error) {
        console.error('Erro ao buscar histórico:', error);
      } finally {
        setLoading(false);
      }
    };

    if (orderId && itemId) {
      fetchHistory();
    }
  }, [orderId, itemId]);

  return { appointments, loading };
}
