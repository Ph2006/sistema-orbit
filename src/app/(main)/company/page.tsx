1. Atualizar o schema overtimeSchema
Altere o campo osNumber para torná-lo opcional:
typescriptconst overtimeSchema = z.object({
    id: z.string(),
    osNumber: z.string().optional().or(z.literal("")), // ALTERADO - agora é opcional
    date: z.string().min(1, { message: "A data é obrigatória." }),
    startTime: z.string().min(1, { message: "O horário de entrada é obrigatório." }),
    endTime: z.string().min(1, { message: "O horário de saída é obrigatório." }),
    resources: z.array(z.string()).min(1, { message: "Selecione pelo menos um recurso." }),
    teamLeaders: z.array(z.string()).min(1, { message: "Selecione pelo menos um líder." }),
    observations: z.string().optional(),
    approvedBy: z.string().optional(),
    approvedAt: z.any().optional(),
    status: z.enum(["pendente", "aprovado", "rejeitado"]).default("pendente"),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});
2. Atualizar o FormField da OS no Dialog
Remova o asterisco (*) e ajuste o label:
typescript<FormField 
  control={overtimeForm.control} 
  name="osNumber" 
  render={({ field }) => (
    <FormItem>
      <FormLabel>Ordem de Serviço (Opcional)</FormLabel> {/* ALTERADO - adicionado "(Opcional)" */}
      <Select onValueChange={field.onChange} defaultValue={field.value}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma OS ou deixe em branco" /> {/* ALTERADO - texto do placeholder */}
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {orderServices.map((os) => (
            <SelectItem key={os.id} value={os.id}>
              {os.numeroOS} - {os.nomeCliente}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormMessage />
    </FormItem>
  )} 
/>
3. Atualizar a exibição na tabela
Ajuste para mostrar "Sem OS" quando não houver OS selecionada:
typescript<TableCell className="font-medium">
  {os?.numeroOS || 'Sem OS'} {/* ALTERADO */}
  <div className="text-xs text-muted-foreground">
    {os?.nomeCliente || 'Informação nas observações'} {/* ALTERADO */}
  </div>
</TableCell>
4. Atualizar a função de exportação PDF
Ajuste para lidar com OS vazia:
typescriptconst exportOvertimeToPDF = async (overtime: OvertimeRelease) => {
    // ... código anterior ...
    
    const os = orderServices.find(o => o.id === overtime.osNumber);
    
    // ... no HTML, alterar a seção de informações da OS:
    
    <div class="info-card">
      <h3>📋 Informações ${os ? 'da Ordem de Serviço' : 'do Trabalho'}</h3>
      ${os ? `
        <p><span class="label">Número da OS:</span> ${os.numeroOS}</p>
        <p><span class="label">Cliente:</span> ${os.nomeCliente}</p>
      ` : `
        <p><span class="label">Referência:</span> Sem OS vinculada</p>
        <p style="font-size: 10px; color: #6b7280;">Verifique as observações para mais detalhes</p>
      `}
    </div>
Pronto! Agora o campo OS é opcional e você pode preencher as informações diretamente no campo de observações. O sistema vai funcionar normalmente sem exigir uma OS.
