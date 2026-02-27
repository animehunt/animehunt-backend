app.get("/create-admin-now", async (req, res) => {

  await Admin.create({
    username: "anime_moderator_007",
    password: "$2a$12$1RdWqkMMG4j/haO5CROyqeh37cXvV6cYGXqY0YcoKFDpccBQFJHle"
  });

  res.send("Admin Created Successfully ✅");
});
