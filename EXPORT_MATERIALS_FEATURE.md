# Funcionalidade de Exportação de Requisições de Materiais em PDF

## Descrição
Foi implementada uma funcionalidade completa para exportar requisições de materiais em formato PDF, permitindo tanto a exportação individual quanto em lote.

## Funcionalidades Implementadas

### 1. Exportação Individual de Requisições
- **Localização**: Botão com ícone de download (FileDown) na coluna "Ações" de cada requisição
- **Tooltip**: "Exportar PDF" para identificação clara da função
- **Conteúdo do PDF**:
  - Logo da empresa (se configurado)
  - Cabeçalho com número da requisição
  - Informações da OS vinculada e cliente
  - Informações gerais da requisição (data, solicitante, departamento, status)
  - Tabela detalhada com todos os itens solicitados
  - Informações de aprovação (se houver)
  - Data de geração do documento

### 2. Exportação em Lote (Relatório Geral)
- **Localização**: Botão "Exportar Todas (PDF)" próximo ao botão "Nova Requisição"
- **Visibilidade**: Aparece apenas na aba "Requisições"
- **Conteúdo do PDF**:
  - Logo da empresa
  - Cabeçalho do relatório com data de geração
  - Resumo geral com contagem por status
  - Lista completa de todas as requisições
  - Informações consolidadas (número, data, solicitante, OS, cliente, quantidade de itens, status)

## Implementação Técnica

### Bibliotecas Utilizadas
- **jsPDF**: Para geração dos documentos PDF
- **jspdf-autotable**: Para criação de tabelas formatadas

### Funções Principais
1. `handleExportRequisitionPDF(requisition)`: Exporta uma requisição individual
2. `handleExportAllRequisitionsPDF()`: Exporta relatório consolidado

### Tratamento de Erros
- Validação de dados antes da exportação
- Mensagens de erro amigáveis via toast
- Fallbacks para dados ausentes

### Características dos PDFs Gerados
- **Layout profissional** com logo da empresa
- **Formatação consistente** com dados da empresa
- **Nomes de arquivo intuitivos**:
  - Individual: `Requisicao_[numero].pdf`
  - Relatório: `Relatorio_Requisicoes_[ddmmaaaa].pdf`
- **Responsividade** das tabelas com ajuste automático de colunas
- **Rodapé** com data e hora de geração

## Como Usar

### Exportação Individual
1. Navegue até a aba "Requisições"
2. Localize a requisição desejada na tabela
3. Clique no ícone de download (primeira ação da linha)
4. O PDF será baixado automaticamente

### Exportação em Lote
1. Navegue até a aba "Requisições"
2. Clique no botão "Exportar Todas (PDF)" no cabeçalho
3. O relatório consolidado será baixado automaticamente

## Melhorias Futuras Sugeridas
- [ ] Filtros para exportação seletiva (por período, status, solicitante)
- [ ] Opção de envio por email
- [ ] Assinatura digital
- [ ] Templates personalizáveis
- [ ] Exportação em outros formatos (Excel, CSV)

## Notas Técnicas
- A funcionalidade utiliza dados do Firestore da empresa "mecald"
- Compatível com o sistema de tooltips já existente
- Integrada com o sistema de notificações (toast)
- Mantém a consistência visual com o restante da aplicação
