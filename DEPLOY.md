# Deploy do Sistema Orbit

## Configuração do Netlify

### 1. Variáveis de Ambiente

No painel do Netlify, configure as seguintes variáveis de ambiente:

```
NEXT_PUBLIC_FIREBASE_API_KEY=sua_api_key_do_firebase
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=seu_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=seu_projeto.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=seu_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=seu_app_id
NODE_ENV=production
```

### 2. Configurações de Build

- **Build command**: `npm run build`
- **Publish directory**: `.next`
- **Node version**: `18`
- **Plugin**: `@netlify/plugin-nextjs` (configurado automaticamente)

### 3. Deploy Automático

O deploy é automaticamente acionado quando há push para a branch `main` no GitHub.

### 4. Funcionalidades Implementadas

- ✅ Exportação de requisições de materiais em PDF (individual e em lote)
- ✅ Upload robusto de fotos em relatórios de inspeção dimensional
- ✅ Correção de salvamento de requisições (campos undefined)
- ✅ Sistema de controle de qualidade completo

### 5. URLs

- **Repositório**: https://github.com/Ph2006/sistema-orbit.git
- **Deploy**: Configurado para deploy automático no Netlify

### 6. Solução de Problemas

Se as mudanças não aparecerem no site:

1. Verifique se o push foi feito para a branch `main`
2. Aguarde alguns minutos para o deploy automático
3. Limpe o cache do navegador (Ctrl+F5)
4. Verifique os logs de deploy no painel do Netlify

## Últimas Atualizações

- **2025-07-01**: Implementação de exportação PDF e upload de fotos
- **2025-07-01**: Correção de erros JSX na página de qualidade
- **2025-07-01**: Configuração do plugin oficial Next.js para Netlify
