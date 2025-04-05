import { prisma } from '../db/index.js';

// 查找所有用户
const findAll = async () => {
  return await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true
    }
  });
};

// 根据ID查找用户
const findById = async (id) => {
  return await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true
    }
  });
};

// 根据邮箱查找用户
const findByEmail = async (email) => {
  return await prisma.user.findUnique({
    where: { email }
  });
};

// 创建用户
const create = async (userData) => {
  return await prisma.user.create({
    data: userData
  });
};

// 更新用户
const update = async (id, updateData) => {
  return await prisma.user.update({
    where: { id },
    data: updateData
  });
};

// 删除用户
const remove = async (id) => {
  return await prisma.user.delete({
    where: { id }
  });
};

export {
  findAll,
  findById,
  findByEmail,
  create,
  update,
  remove
}; 