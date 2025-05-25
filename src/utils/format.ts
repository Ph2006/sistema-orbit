import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Formata um número com separadores de milhares e decimais
 * @param value Número a ser formatado
 * @returns String formatada
 */
export const formatNumber = (value: number): string => {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * Formata uma data para o padrão brasileiro
 * @param dateString Data em formato string
 * @returns String formatada no padrão dd/MM/yyyy
 */
export const formatDate = (dateString: string): string => {
  try {
    // Remove qualquer offset de fuso horário usando apenas a parte da data
    const date = new Date(dateString.split('T')[0] + 'T00:00:00');
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    return dateString;
  }
};

/**
 * Formata uma data e hora para o padrão brasileiro
 * @param dateString Data em formato string
 * @returns String formatada no padrão dd/MM/yyyy HH:mm
 */
export const formatDateTime = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    return format(date, 'dd/MM/yyyy HH:mm', { locale: ptBR });
  } catch (error) {
    console.error('Erro ao formatar data e hora:', error);
    return dateString;
  }
};

/**
 * Formata um valor monetário para o padrão brasileiro
 * @param value Valor a ser formatado
 * @returns String formatada no padrão R$ 0,00
 */
export const formatCurrency = (value: number): string => {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

/**
 * Formata um número de telefone para o padrão brasileiro
 * @param phone Número de telefone
 * @returns String formatada no padrão (00) 00000-0000
 */
export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{2})(\d{5})(\d{4})$/);
  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }
  return phone;
};

/**
 * Formata um CNPJ para o padrão brasileiro
 * @param cnpj CNPJ
 * @returns String formatada no padrão 00.000.000/0000-00
 */
export const formatCNPJ = (cnpj: string): string => {
  const cleaned = cnpj.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/);
  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}/${match[4]}-${match[5]}`;
  }
  return cnpj;
};

/**
 * Formata um CPF para o padrão brasileiro
 * @param cpf CPF
 * @returns String formatada no padrão 000.000.000-00
 */
export const formatCPF = (cpf: string): string => {
  const cleaned = cpf.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{3})(\d{2})$/);
  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}-${match[4]}`;
  }
  return cpf;
}; 