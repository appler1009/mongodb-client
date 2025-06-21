// docker-entrypoint-initdb.d/init-mongo.js

// The root 'admin' user is already created by MONGO_INITDB_ROOT_USERNAME/PASSWORD in docker-compose.yml.
// So, we don't need to create it here.

// Switch to the 'testdb' database (this implicitly creates it if it doesn't exist)
var db = db.getSiblingDB('testdb');

// Optional: Drop existing collections if you want a clean slate every time this script runs
// (Useful for development, comment out in production if you want to retain data)
db.users.drop();
db.products.drop();
db.orders.drop();
print("Dropped existing collections (if any) in 'testdb' for a clean slate.");


// Create a specific user for 'testdb' if needed by your application
// Your application currently uses 'admin', so this user is optional but good practice.
// If you create this user, remember to update your connections.json to use it.
try {
  db.createUser(
    {
      user: "appuser", // A new user specific to 'testdb'
      pwd: "apppassword",
      roles: [ { role: "readWrite", db: "testdb" } ]
    }
  );
  print("Created user 'appuser' for 'testdb'.");
} catch (e) {
  if (e.code === 51003) { // Error code for 'UserExists'
    print("User 'appuser' already exists in 'testdb'. Skipping creation.");
  } else {
    throw e; // Re-throw other errors
  }
}


// Populate 'users' collection
db.users.insertMany([
  { "name": "Alice Wonderland", "age": 30, "email": "alice@example.com", "isActive": true, "roles": ["user", "admin"], "timestamp": new Date() },
  { "name": "Bob The Builder", "age": 24, "email": "bob@example.com", "isActive": false, "lastLogin": new Date("2024-05-15T10:00:00Z"), "timestamp": new Date() },
  { "name": "Charlie Chaplin", "age": 35, "email": "charlie@example.com", "isActive": true, "address": { "street": "123 Main St", "city": "Springfield" }, "timestamp": new Date() },
  { "name": "Diana Prince", "age": 28, "email": "diana@example.com", "isActive": true, "roles": ["user"], "timestamp": new Date() },
  { "name": "Eve Harrington", "age": 42, "email": "eve@example.com", "isActive": false, "timestamp": new Date() },
  { "name": "Frankenstein", "age": 200, "email": "frank@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Grace Hopper", "age": 90, "email": "grace@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Harry Potter", "age": 17, "email": "harry@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Ivy League", "age": 22, "email": "ivy@example.com", "isActive": false, "timestamp": new Date() },
  { "name": "Jack Sparrow", "age": 50, "email": "jack@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Karen Carpenter", "age": 32, "email": "karen@example.com", "isActive": false, "timestamp": new Date() },
  { "name": "Liam Neeson", "age": 70, "email": "liam@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Mia Khalifa", "age": 30, "email": "mia@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Nate Dogg", "age": 45, "email": "nate@example.com", "isActive": false, "timestamp": new Date() },
  { "name": "Olivia Newton", "age": 73, "email": "olivia@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Peter Pan", "age": 12, "email": "peter@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Quinn Fabray", "age": 18, "email": "quinn@example.com", "isActive": false, "timestamp": new Date() },
  { "name": "Ryan Gosling", "age": 43, "email": "ryan@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Selena Gomez", "age": 31, "email": "selena@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Taylor Swift", "age": 34, "email": "taylor@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Ursula K. Le Guin", "age": 89, "email": "ursula@example.com", "isActive": false, "timestamp": new Date() },
  { "name": "Victor Frankenstein", "age": 25, "email": "victor@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Wanda Maximoff", "age": 27, "email": "wanda@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Xavier Niel", "age": 55, "email": "xavier@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Yara Shahidi", "age": 24, "email": "yara@example.com", "isActive": true, "timestamp": new Date() },
  { "name": "Zoe Kravitz", "age": 35, "email": "zoe@example.com", "isActive": true, "timestamp": new Date() }
]);

// Populate 'products' collection
db.products.insertMany([
  { "productName": "Laptop Pro 15", "category": "Electronics", "price": 1499.99, "inStock": 50, "features": ["SSD", "8GB RAM"], "timestamp": new Date() },
  { "productName": "Wireless Ergonomic Mouse", "category": "Peripherals", "price": 45.00, "inStock": 200, "timestamp": new Date() },
  { "productName": "Mechanical Keyboard", "category": "Peripherals", "price": 120.50, "inStock": 75, "color": "Black", "timestamp": new Date() },
  { "productName": "USB-C Hub", "category": "Accessories", "price": 30.00, "inStock": 300, "ports": ["USB A", "HDMI", "SD Card"], "timestamp": new Date() },
  { "productName": "External SSD 1TB", "category": "Storage", "price": 99.99, "inStock": 120, "timestamp": new Date() },
  { "productName": "Gaming Headset", "category": "Audio", "price": 79.99, "inStock": 80, "timestamp": new Date() },
  { "productName": "Webcam HD", "category": "Peripherals", "price": 55.00, "inStock": 150, "timestamp": new Date() },
  { "productName": "Monitor 27-inch 4K", "category": "Displays", "price": 399.00, "inStock": 40, "timestamp": new Date() },
  { "productName": "Smartwatch", "category": "Wearables", "price": 199.00, "inStock": 90, "timestamp": new Date() },
  { "productName": "Fitness Tracker", "category": "Wearables", "price": 60.00, "inStock": 110, "timestamp": new Date() },
  { "productName": "Portable Charger", "category": "Accessories", "price": 25.00, "inStock": 250, "timestamp": new Date() },
  { "productName": "Noise-Cancelling Headphones", "category": "Audio", "price": 249.00, "inStock": 60, "timestamp": new Date() },
  { "productName": "Graphic Tablet", "category": "Art & Design", "price": 299.00, "inStock": 30, "timestamp": new Date() }
]);

// Populate 'orders' collection
db.orders.insertMany([
  { "orderId": "ORD001", "userId": "alice@example.com", "items": [{ "productId": "Laptop Pro 15", "qty": 1 }], "totalAmount": 1499.99, "status": "completed", "orderDate": new Date("2024-06-01T14:30:00Z"), "timestamp": new Date() },
  { "orderId": "ORD002", "userId": "bob@example.com", "items": [{ "productId": "Wireless Ergonomic Mouse", "qty": 2 }, { "productId": "Mechanical Keyboard", "qty": 1 }], "totalAmount": 210.50, "status": "pending", "orderDate": new Date("2024-06-05T09:15:00Z"), "timestamp": new Date() },
  { "orderId": "ORD003", "userId": "charlie@example.com", "items": [{ "productId": "External SSD 1TB", "qty": 1 }, { "productId": "USB-C Hub", "qty": 1 }], "totalAmount": 129.99, "status": "completed", "orderDate": new Date("2024-06-10T11:00:00Z"), "timestamp": new Date() },
  { "orderId": "ORD004", "userId": "diana@example.com", "items": [{ "productId": "Gaming Headset", "qty": 1 }], "totalAmount": 79.99, "status": "shipped", "orderDate": new Date("2024-06-12T16:00:00Z"), "timestamp": new Date() },
  { "orderId": "ORD005", "userId": "alice@example.com", "items": [{ "productId": "Monitor 27-inch 4K", "qty": 1 }], "totalAmount": 399.00, "status": "pending", "orderDate": new Date("2024-06-18T10:00:00Z"), "timestamp": new Date() }
]);

print("MongoDB initialization script finished.");
