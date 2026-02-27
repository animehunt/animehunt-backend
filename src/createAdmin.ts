import mongoose from "mongoose";

mongoose.connect(process.env.MONGO_URI as string);

const adminSchema = new mongoose.Schema({
  username: String,
  password: String
});

const Admin = mongoose.model("Admin", adminSchema);

async function createAdmin() {

  await Admin.create({
    username: "anime_moderator_007",
    password: "$2a$12$1RdWqkMMG4j/haO5CROyqeh37cXvV6cYGXqY0YcoKFDpccBQFJHle"
  });

  console.log("✅ Admin Created Successfully");
  process.exit();
}

createAdmin();
