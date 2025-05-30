// utils/format.ts - Funções de formatação seguras e robustas

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Formata datas com máxima segurança e suporte a múltiplos formatos
 * Suporta: strings, Date objects, Firestore Timestamps, objetos customizados
 */
export const formatDate = (date: any, formatStr: string = 'dd/MM/yyyy'): string => {
  try {
    if (!date) return 'Data não informada';
    
    let dateObj: Date;
    
    // Tratamento abrangente de diferentes tipos de entrada
    if (typeof date === 'string') {
      if (date.trim() === '') return 'Data não informada';
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else if (date && typeof date === 'object') {
      // Firestore Timestamp - método toDate()
      if (date.toDate && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      }
      // Firestore Timestamp - propriedade seconds
      else if (date.seconds && typeof date.seconds === 'number') {
        dateObj = new Date(date.seconds * 1000);
      }
      // Timestamp com nanoseconds (formato alternativo)
      else if (date._seconds || date.nanoseconds || date._nanoseconds) {
        const seconds = date._seconds || date.seconds || 0;
        dateObj = new Date(seconds * 1000);
      }
      // Objeto com propriedades de data
      else if (date.year || date.month || date.day) {
        const year = date.year || new Date().getFullYear();
        const month = (date.month || 1) - 1; // JavaScript months are 0-based
        const day = date.day || 1;
        dateObj = new Date(year, month, day);
      }
      // Timestamp Unix (em milissegundos)
      else if (date.timestamp && typeof date.timestamp === 'number') {
        dateObj = new Date(date.timestamp);
      }
      else {
        console.warn('🔴 Formato de data objeto não reconhecido:', date);
        return 'Formato de data inválido';
      }
    } else {
      console.warn('🔴 Tipo de data não suportado:', typeof date, date);
      return 'Tipo de data inválido';
    }
    
    // Verificação final de validade
    if (isNaN(dateObj.getTime())) {
      console.warn('🔴 Data inválida após conversão:', date, '→', dateObj);
      return 'Data inválida';
    }
    
    // Usar date-fns para formatação com locale brasileiro
    return format(dateObj, formatStr, { locale: ptBR });
    
  } catch (error) {
    console.error('🔴 Erro crítico ao formatar data:', error, 'Input:', date);
    return 'Erro na formatação';
  }
};

/**
 * Formata números com segurança
 */
export const formatNumber = (value: any, decimals: number = 2): string => {
  try {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return '0';
    
    return num.toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  } catch (error) {
    console.error('Erro ao formatar número:', error);
    return '0';
  }
};

/**
 * Formata valores monetários
 */
export const formatCurrency = (value: any): string => {
  try {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return 'R$ 0,00';
    
    return num.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  } catch (error) {
    console.error('Erro ao formatar moeda:', error);
    return 'R$ 0,00';
  }
};

/**
 * Normaliza datas para comparação e ordenação
 * Retorna Date object válido ou null
 */
export const normalizeDate = (date: any): Date | null => {
  try {
    if (!date) return null;
    
    let dateObj: Date;
    
    if (typeof date === 'string') {
      if (date.trim() === '') return null;
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else if (date && typeof date === 'object') {
      if (date.toDate && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      } else if (date.seconds && typeof date.seconds === 'number') {
        dateObj = new Date(date.seconds * 1000);
      } else if (date._seconds || date.nanoseconds || date._nanoseconds) {
        const seconds = date._seconds || date.seconds || 0;
        dateObj = new Date(seconds * 1000);
      } else if (date.year || date.month || date.day) {
        const year = date.year || new Date().getFullYear();
        const month = (date.month || 1) - 1;
        const day = date.day || 1;
        dateObj = new Date(year, month, day);
      } else if (date.timestamp && typeof date.timestamp === 'number') {
        dateObj = new Date(date.timestamp);
      } else {
        return null;
      }
    } else {
      return null;
    }
    
    if (isNaN(dateObj.getTime())) {
      return null;
    }
    
    return dateObj;
  } catch (error) {
    console.error('🔴 Erro ao normalizar data:', error);
    return null;
  }
};

/**
 * Compara duas datas para ordenação
 * Retorna: negativo (a < b), zero (a = b), positivo (a > b)
 */
export const compareDates = (dateA: any, dateB: any): number => {
  const normalizedA = normalizeDate(dateA);
  const normalizedB = normalizeDate(dateB);
  
  // Se ambas são nulas/inválidas, são iguais
  if (!normalizedA && !normalizedB) return 0;
  
  // Se uma é nula/inválida, vai para o final
  if (!normalizedA) return 1;
  if (!normalizedB) return -1;
  
  // Comparar timestamps (crescente = mais antiga primeiro)
  return normalizedA.getTime() - normalizedB.getTime();
};

/**
 * Função utilitária para debug de datas
 */
export const debugDate = (date: any, label: string = 'Data'): void => {
  console.log(`🐛 ${label}:`, {
    original: date,
    type: typeof date,
    isDate: date instanceof Date,
    hasToDate: date && typeof date.toDate === 'function',
    hasSeconds: date && typeof date.seconds === 'number',
    normalized: normalizeDate(date),
    formatted: formatDate(date)
  });
};

/**
 * Formata duração em milissegundos para formato legível
 */
export const formatDuration = (milliseconds: number): string => {
  try {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  } catch (error) {
    console.error('Erro ao formatar duração:', error);
    return '0s';
  }
};

/**
 * Formata peso com unidade apropriada (kg, ton)
 */
export const formatWeight = (weightInKg: number): string => {
  try {
    if (isNaN(weightInKg) || weightInKg === 0) return '0 kg';
    
    if (weightInKg >= 1000) {
      const tons = weightInKg / 1000;
      return `${formatNumber(tons, 2)} ton`;
    }
    
    return `${formatNumber(weightInKg, 2)} kg`;
  } catch (error) {
    console.error('Erro ao formatar peso:', error);
    return '0 kg';
  }
};

/**
 * Formata porcentagem
 */
export const formatPercentage = (value: number, decimals: number = 1): string => {
  try {
    if (isNaN(value)) return '0%';
    return `${formatNumber(value, decimals)}%`;
  } catch (error) {
    console.error('Erro ao formatar porcentagem:', error);
    return '0%';
  }
};

/**
 * Trunca texto com ellipsis
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

/**
 * Formata telefone brasileiro
 */
export const formatPhone = (phone: string): string => {
  try {
    if (!phone) return '';
    
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (cleaned.length === 10) {
      return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    
    return phone;
  } catch (error) {
    console.error('Erro ao formatar telefone:', error);
    return phone;
  }
};

/**
 * Formata CPF
 */
export const formatCPF = (cpf: string): string => {
  try {
    if (!cpf) return '';
    
    const cleaned = cpf.replace(/\D/g, '');
    
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    
    return cpf;
  } catch (error) {
    console.error('Erro ao formatar CPF:', error);
    return cpf;
  }
};

/**
 * Formata CNPJ
 */
export const formatCNPJ = (cnpj: string): string => {
  try {
    if (!cnpj) return '';
    
    const cleaned = cnpj.replace(/\D/g, '');
    
    if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    
    return cnpj;
  } catch (error) {
    console.error('Erro ao formatar CNPJ:', error);
    return cnpj;
  }
};
