import type { Permission } from '@aprotel/shared';
import { BranchModel } from '../models/branch.model.js';
import { AppError } from '../utils/errors.js';
import { isDuplicateKey } from '../utils/object-id.js';
import { withTransaction } from '../utils/transaction.js';
import { recordAudit } from './audit.service.js';
import { ensureStockLevelsForBranch } from './inventory.service.js';

interface Actor {
  id: string;
  permissions: Permission[];
  ipAddress?: string;
  userAgent?: string;
}

interface BranchInput {
  name: string;
  code: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  country?: string;
  postalCode?: string;
  phone: string;
  email?: string;
  isCentral?: boolean;
  status?: 'active' | 'inactive';
  displayOrder?: number;
}

export async function listPublicBranches() {
  const branches = await BranchModel.find({ status: 'active' }).sort({ displayOrder: 1, name: 1 });
  return branches.map(presentBranch);
}

export async function listAdminBranches() {
  const branches = await BranchModel.find().sort({ displayOrder: 1, name: 1 });
  return branches.map(presentBranch);
}

export async function createBranch(input: BranchInput, actor: Actor) {
  try {
    const branch = await withTransaction(async (session) => {
      if (input.isCentral) await BranchModel.updateMany({ isCentral: true }, { $set: { isCentral: false } }, { session });
      const [created] = await BranchModel.create([{ ...input, email: input.email ?? '', status: input.status ?? 'active' }], { session });
      if (created!.status === 'active') await ensureStockLevelsForBranch(created!._id, session);
      return created!;
    });
    await recordAudit({ actorId: actor.id, action: 'branch.create', resourceType: 'branch', resourceId: String(branch._id), ipAddress: actor.ipAddress, userAgent: actor.userAgent });
    return presentBranch(branch);
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'A branch with that code already exists', 409);
    throw error;
  }
}

export async function updateBranch(id: string, input: Partial<BranchInput>, actor: Actor) {
  const branch = await BranchModel.findById(id);
  if (!branch) throw new AppError('NOT_FOUND', 'Branch was not found', 404);
  if (input.status === 'inactive' && branch.isCentral && input.isCentral !== false) {
    const replacement = await BranchModel.countDocuments({ _id: { $ne: id }, isCentral: true, status: 'active' });
    if (replacement === 0) {
      throw new AppError('UNPROCESSABLE', 'Assign another active central branch before deactivating this one', 422);
    }
  }
  await withTransaction(async (session) => {
    if (input.isCentral) await BranchModel.updateMany({ _id: { $ne: id }, isCentral: true }, { $set: { isCentral: false } }, { session });
    Object.assign(branch, input);
    await branch.save({ session });
    if (branch.status === 'active') await ensureStockLevelsForBranch(branch._id, session);
  });
  await recordAudit({ actorId: actor.id, action: 'branch.update', resourceType: 'branch', resourceId: id, ipAddress: actor.ipAddress, userAgent: actor.userAgent });
  return presentBranch(branch);
}

export function presentBranch(branch: {
  _id: { toString(): string };
  name: string;
  code: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  country: string;
  postalCode?: string;
  phone: string;
  email?: string;
  isCentral: boolean;
  status: string;
  displayOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: String(branch._id),
    name: branch.name,
    code: branch.code,
    addressLine1: branch.addressLine1,
    addressLine2: branch.addressLine2 ?? '',
    city: branch.city,
    state: branch.state,
    country: branch.country,
    postalCode: branch.postalCode ?? '',
    phone: branch.phone,
    email: branch.email ?? '',
    isCentral: branch.isCentral,
    status: branch.status,
    displayOrder: branch.displayOrder,
    createdAt: branch.createdAt,
    updatedAt: branch.updatedAt,
  };
}
