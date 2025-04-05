const userDal = require('../dal/userDal');

// 获取所有用户
const getAllUsers = async (req, res, next) => {
  try {
    const users = await userDal.findAll();
    res.json(users);
  } catch (error) {
    next(error);
  }
};

// 根据ID获取用户
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await userDal.findById(Number(id));
    
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    res.json(user);
  } catch (error) {
    next(error);
  }
};

// 创建用户
const createUser = async (req, res, next) => {
  try {
    const { email, name, password } = req.body;
    
    // 验证请求
    if (!email || !password) {
      return res.status(400).json({ message: '邮箱和密码为必填项' });
    }
    
    // 检查邮箱是否已存在
    const existingUser = await userDal.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: '该邮箱已被注册' });
    }
    
    // 创建用户
    const newUser = await userDal.create({
      email,
      name,
      password
    });
    
    // 不要在响应中返回密码
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    next(error);
  }
};

// 更新用户
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;
    
    // 验证用户存在
    const existingUser = await userDal.findById(Number(id));
    if (!existingUser) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    // 准备更新数据
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (password) updateData.password = password;
    
    // 更新用户
    const updatedUser = await userDal.update(Number(id), updateData);
    
    // 不要在响应中返回密码
    const { password: _, ...userWithoutPassword } = updatedUser;
    res.json(userWithoutPassword);
  } catch (error) {
    next(error);
  }
};

// 删除用户
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // 验证用户存在
    const existingUser = await userDal.findById(Number(id));
    if (!existingUser) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    // 删除用户
    await userDal.remove(Number(id));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
}; 