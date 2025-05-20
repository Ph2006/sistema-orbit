import React, { useState, useEffect } from 'react';
import { X, Edit, Info, ArrowDown } from 'lucide-react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Order, OrderItem } from '../types/kanban';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface QualityDocument {
  id: string;
  orderId: string;
  templateId: string;
  name: string;
  description: string;
  driveLink: string;
  uploadedAt: string;
  uploadedBy: string;
  status: 'pending' | 'verified' | 'unverified';
  verifiedAt?: string;
  verifiedBy?: string;
  comments?: string;
  required: boolean;
  lastAccessed?: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  required: boolean;
}

export interface DocumentValidation {
  id: string;
  documentId: string;
  orderId: string;
  validatedAt: string;
  validatedBy: string;
  status: 'approved' | 'rejected';
  comments?: string;
  signature?: string;
}

// New interfaces for welding machine calibration
export interface WeldingMachineCalibration {
  id: string;
  machineId: string;
  machineName: string;
  serialNumber: string;
  model: string;
  manufacturer: string;
  calibrationDate: string;
  nextCalibrationDate: string;
  calibratedBy: string;
  calibrationStandard: string;
  parameters: WeldingMachineParameter[];
  notes?: string;
  photos: string[];
  attachments?: string[];
  status: 'valid' | 'expired' | 'pending';
  approvedBy?: string;
  approvalDate?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeldingMachineParameter {
  id: string;
  name: string;
  nominalValue: number;
  measuredValue: number;
  tolerance: number;
  unit: string;
  isWithinTolerance: boolean;
  calibrationMethod?: string;
}

export interface WeldingMachine {
  id: string;
  name: string;
  serialNumber: string;
  model: string;
  manufacturer: string;
  type: 'MIG/MAG' | 'TIG' | 'Stick' | 'Plasma' | 'Spot' | 'Other';
  purchaseDate?: string;
  location?: string;
  department?: string;
  responsible?: string;
  status: 'active' | 'maintenance' | 'inactive' | 'retired';
  lastCalibrationDate?: string;
  nextCalibrationDate?: string;
  calibrationFrequency: number; // In days
  notes?: string;
  photos?: string[];
  createdAt: string;
}

// New interfaces for quality metrics
export interface NonConformity {
  id: string;
  orderId: string;
  itemId: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  createdAt: string;
  createdBy: string;
  assignedTo?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionDescription?: string;
  attachments?: string[];
  rootCause?: string;
  preventiveAction?: string;
  followUpRequired: boolean;
  followUpDate?: string;
  impactedAreas?: string[];
  costImpact?: number;
  fiveWhys?: FiveWhyAnalysis;
}

export interface FiveWhyAnalysis {
  problem: string;
  whys: string[];
  rootCause: string;
  correctionPlan: string;
}

export interface InspectionChecklistTemplate {
  id: string;
  name: string;
  description: string;
  sections: InspectionSection[];
  applicableToStages?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InspectionSection {
  id: string;
  name: string;
  items: InspectionItem[];
}

export interface InspectionItem {
  id: string;
  description: string;
  type: 'boolean' | 'numeric' | 'text';
  required: boolean;
  expectedValue?: string | number | boolean;
  tolerance?: number;
  unit?: string;
  criticalItem: boolean;
}

export interface InspectionResult {
  id: string;
  orderId: string;
  itemId?: string;
  checklistId: string;
  checklistName: string;
  inspector: string;
  inspectionDate: string;
  status: 'passed' | 'failed' | 'partial';
  comments?: string;
  sections: InspectionResultSection[];
  attachments?: string[];
  signatureUrl?: string;
  photoAttachments?: Record<string, string[]>;
}

export interface InspectionResultSection {
  id: string;
  name: string;
  items: InspectionResultItem[];
}

export interface InspectionResultItem {
  id: string;
  description: string;
  result: boolean | number | string;
  passed: boolean;
  comments?: string;
  criticalItem: boolean;
  photos?: string[];
}

// Engineering calls for revision requests
export interface EngineeringCall {
  id: string;
  orderId: string;
  orderNumber: string;
  customer: string;
  itemId: string;
  itemNumber: string;
  itemCode: string;
  title: string;
  description: string;
  revision: string;
  status: 'pending' | 'in-progress' | 'completed';
  engineeringEmail: string;
  ccEmails: string[];
  createdAt: string;
  createdBy: string;
  respondedAt: string;
  respondedBy: string;
  response: string;
  attachmentUrls: string[];
}

// Quality metrics/indicators
export interface QualityMetric {
  id: string;
  name: string;
  description: string;
  targetValue: number;
  unit: string;
  lowerLimit?: number;
  upperLimit?: number;
  critical: boolean;
  dataPoints: QualityMetricDataPoint[];
}

export interface QualityMetricDataPoint {
  date: string;
  value: number;
}

// New interfaces for specific quality reports
export interface QualityReport {
  id: string;
  orderId: string;
  itemId: string;
  reportType: ReportType;
  reportNumber: string;
  inspector: string;
  inspectionDate: string;
  approvedBy?: string;
  approvalDate?: string;
  status: 'draft' | 'approved' | 'rejected' | 'pending-review';
  comments?: string;
  attachments?: string[];
  signatureUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReportType = 
  | 'dimensional' 
  | 'liquid-penetrant' 
  | 'visual-welding' 
  | 'ultrasonic';

// Dimensional Report
export interface DimensionalReport extends QualityReport {
  reportType: 'dimensional';
  standard?: string; // Reference standard
  drawingNumber: string; // Drawing reference
  measurements: DimensionalMeasurement[];
  equipment?: string; // Equipment used for measurement
  drawingRevision?: string;
  temperature?: number; // Testing temperature
  humidity?: number; // Testing humidity
}

export interface DimensionalMeasurement {
  id: string;
  dimensionName: string;
  nominalValue: number;
  actualValue: number;
  unit: string;
  tolerance: {
    upper: number;
    lower: number;
  };
  isWithinTolerance: boolean;
  measurementPoint?: string; // Where measured
}

// Liquid Penetrant Report
export interface LiquidPenetrantReport extends QualityReport {
  reportType: 'liquid-penetrant';
  standard: string; // NDT standard (e.g., ASME V, Article 6)
  material: string;
  surfaceCondition: string;
  penetrantType: string; // Type I, II, etc.
  penetrantMethod: 'visible' | 'fluorescent';
  developerType: string;
  temperatureRange: {
    min: number;
    max: number;
  };
  dwellTime: {
    penetrant: number; // minutes
    developer: number; // minutes
  };
  findings: LPFinding[];
  penetrantBrandName?: string;
  batchNumbers?: {
    penetrant: string;
    cleaner: string;
    developer: string;
  };
  acceptanceCriteria: string;
}

export interface LPFinding {
  id: string;
  locationDescription: string;
  indicationType: 'linear' | 'rounded' | 'aligned' | 'other';
  size: number;
  unit: string;
  result: 'acceptable' | 'rejectable';
  photoReference?: string;
  comments?: string;
}

// Visual Welding Report
export interface VisualWeldingReport extends QualityReport {
  reportType: 'visual-welding';
  weldingProcess: string;
  standard: string; // Inspection standard
  drawingReference: string;
  weldJointType: string; // Butt, fillet, etc.
  weldPosition: string;
  material: string;
  weldJoints: WeldJoint[];
  illumination?: number; // lux
  visualAids?: string[]; // Magnifying glass, etc.
  surfaceCondition: string;
  acceptanceCriteria: string;
}

export interface WeldJoint {
  id: string;
  jointId: string;
  location: string;
  visualDefects: WeldDefect[];
  result: 'acceptable' | 'rejectable';
  comments?: string;
}

export interface WeldDefect {
  id: string;
  defectType: WeldDefectType;
  size?: number;
  unit?: string;
  location: string;
  photoReference?: string;
  isAcceptable: boolean;
}

export type WeldDefectType = 
  | 'crack'
  | 'porosity'
  | 'inclusion'
  | 'incomplete-fusion'
  | 'incomplete-penetration'
  | 'undercut'
  | 'overlap'
  | 'excess-reinforcement'
  | 'misalignment'
  | 'burn-through'
  | 'spatter'
  | 'arc-strike'
  | 'other';

// Ultrasonic Testing Report
export interface UltrasonicReport extends QualityReport {
  reportType: 'ultrasonic';
  standard: string; // NDT standard
  material: string;
  thickness: number;
  surfaceCondition: string;
  equipment: UltrasonicEquipment;
  scanPlan: string;
  calibrationBlock: string;
  calibrationDate: string;
  scanTechnique: 'pulse-echo' | 'through-transmission' | 'phased-array' | 'TOFD' | 'other';
  probes: UltrasonicProbe[];
  indications: UltrasonicIndication[];
  acceptanceCriteria: string;
  scanCoverage: number; // percentage
  couplingMedium: string;
}

export interface UltrasonicEquipment {
  manufacturer: string;
  model: string;
  serialNumber: string;
}

export interface UltrasonicProbe {
  id: string;
  type: string; // Normal, angle, etc.
  frequency: number; // MHz
  size: number; // mm
  angle?: number; // degrees
  serialNumber?: string;
}

export interface UltrasonicIndication {
  id: string;
  locationType: 'weld' | 'base-material' | 'heat-affected-zone';
  locationDetails: string;
  indicationType: 'planar' | 'volumetric' | 'geometric' | 'other';
  size: {
    length: number;
    width?: number;
    height?: number;
  };
  depth: number;
  amplitude: number; // dB
  result: 'acceptable' | 'rejectable';
  comments?: string;
}