Data modeling refers to the organization of data within a database and the links between related entities.

MongoDB has a flexible data model that allows you to store polymorphic data, meaning:

Documents within a single collection are not required to have the same set of fields.

A field's data type can differ between documents within a collection.

A core principle of data modeling in MongoDB is that data that's accessed together should be stored together. You should structure your data model based on your application's data access patterns to optimize performance.

Use Cases
Consider the following examples that take advantage of the document model's flexibility:

- Your company tracks which department each employee works in. You can embed department information in the employee collection to return relevant information in a single query.

- Your e-commerce application shows the five most recent reviews on a product page. You can store all reviews, including older ones, in a separate collection because they are not accessed as frequently.

- Your clothing store needs to create a single-page application for a product catalog. Different products have different attributes and might have different document fields and field types. Despite these differences, you can store all of the products in the same collection.

When you design your data model in MongoDB, consider the structure of your documents and the ways your application uses data from related entities.

To link related data, you can either:
- Embed related data within a single document.
- Reference related data stored in a separate collection.

When you embed related data in a single document, you may duplicate data between two collections. Duplicating data lets your application query related information about multiple entities in a single query while logically separating entities in your model.

Before you duplicate data, consider the following factors:

- The performance benefit for reads when data is duplicated. Duplicating data can remove the need to perform joins across multiple collections, which can improve application performance.

- How often the duplicated data needs to be updated. The extra logic needed to handle infrequent updates is less costly than performing joins (lookups) on read operations. However, frequently updating duplicate data can cause heavy workloads and performance issues.

Keeping related data together will lead to a simpler data model and code. - Embedding

You have a "has-a" or "contains" relationship between entities. - Embedding

Your application queries pieces of information together. - Embedding

You have data that's often updated together. - Embedding

You have data that should be archived at the same time. - Embedding

The child side of the relationship has high cardinality. - Referencing

Data duplication is too complicated to manage and not preferred. - Referencing

The combined size of your data takes up too much memory or transfer bandwidth for your application. - Referencing

Your embedded data grows without bounds. - Referencing

Your data is written at different times in a write-heavy workload. - Referencing

For the child side of the relationship, your data can exist by itself without a parent. - Referencing

When designing your data model, think about how you access and store your data. If you frequently query, filter, sort, or join specific fields, consider creating indexes on those fields. With indexes, MongoDB can:

- Return query results faster

- Sort results more efficiently

- Optimize $lookup and $group operations

- Reduce CPU and I/O usage

In MongoDB, a write operation is atomic on the level of a single document. This means that even if an update operation affects several sub-documents, either all of those sub-documents are updated, or the operation fails entirely and no updates occur.

If your application requires some data to persist in the database for a limited period of time, consider using the Time to Live or TTL feature. For example, TTL collections could be useful for managing user login sessions on a web application, where sessions are set to automatically expire after 30 minutes of inactivity. This means that MongoDB automatically deletes the session documents after the specified time period.

The schema design process helps you identify the data your application needs and organize it to optimize performance.
Tasks
The schema design process consists of the following steps:

1. Identify the operations that your application runs most frequently.
The first step in the schema design process is to identify the operations that your application runs most frequently. This helps you create effective indexes and minimize the number of calls the application makes to the database.

2. Identify the relationships in your application's data and decide whether to link or embed related data.
How you map relationships between data entities affects your application's performance and scalability.

The recommended way to handle related data is to embed it in a sub-document. Embedding related data lets your application query the data it needs with a single read operation and avoid slow $lookup operations.
For some use cases, you can use a reference to point to related data in a separate collection.
3. Apply schema design patterns to optimize reads and writes.
Schema design patterns are ways to optimize your data model for your application's access patterns. They improve application performance and reduce schema complexity. Schema design patterns affect how your data is stored and what data is returned to your application.
Consider the following example patterns used by a movie theater franchise:

The schema contains a movie collection and a theater collection. The schema uses the subset pattern to duplicate a subset of information from the movie collection in the theater collection. The subset pattern reduces the size of documents returned to the application and improves read performance.

The movie collection contains a total_views field, which uses the computed pattern to calculate a running total of the number of times that customers view a movie across all of the theaters where the movie is shown.
4. Create indexes to support common query patterns

An index covers a query when the index contains all of the fields scanned by the query. A covered query scans the index and not the collection, which improves query performance.

Indexes can also partially support queries if a subset of the fields queried are indexed.
A single collection can have a maximum of 64 indexes. However, too many indexes can degrade performance before that limit is reached. For collections with a high write-to-read ratio, indexes can degrade performance because each insert must also update any indexes.

### Schema Design Patterns

Use schema design patterns to optimize your data model based on how your application queries and uses data.

#### Handle Computed Values
Perform calculations in the database so results are ready when the client requests data.
If you want to return calculated data values to your application, you can improve performance by running computations in your database rather than when the data is requested. The application may require either precise calculations or approximate results. By using the Computed and the Approximation schema patterns, you can pre-compute and store the resulting values ahead of time (for example on insert or with a periodic task) so they are readily available when you request the data.
#### Group Data
Group data into series to improve performance and account for outliers.
If your schema contains a large series of data, grouping that data into multiple smaller series can improve performance.

Your schema may also need to handle outliers in a series that cause poor performance for more common data values. To improve performance and organization for groups of data, you can use the bucket and outlier patterns.
#### Polymorphic Data
Handle variable document fields and data types in a single collection.
MongoDB uses a flexible data model, which means documents in a single collection do not need to have the same structure. Polymorphic data is data in a single collection that varies in document fields or data types.

Generally, documents in a collection are similar in structure but may contain slight variations depending on the application. To group similar, non-identical documents in a single collection you can use the Polymorphic and the Inheritance schema design patterns.
#### Document and Schema Versioning
Prepare for schema changes to account for changing technical requirements.
Your schema may need to change over time to account for changing technical requirements. When your schema changes, you can use schema design patterns to retain your original document structure. By retaining historical versions of documents and schemas, you avoid performance-intensive schema migrations and downtime.
#### Archive Pattern
Move old data to a separate location to increase storage and improve performance where data is accessed most frequently.
If you need to store historical data dating back a number of years, storing your oldest data in the same database as your more recent data can negatively impact performance, especially if the old data does not need to be accessed frequently. Instead, you can design your schema to archive old data and move that data to a separate storage location.
#### Single Collection Pattern
Use references to group related documents of different types into a single collection.
Create a data model that uses an array of references to group related documents of different types into a single collection. The Single Collection Pattern can be especially useful for modeling many-to-many relationships with only one copy of the data. This pattern can reduce data duplication in use cases where the cost of duplication is a concern.

The following characteristics define the Single Collection Pattern:

Stores all frequently accessed documents together in a single collection.

Stores relationships between documents as pointers or structures within each document.

Maps the relationships between documents via indexes on the field or array. This index supports the retrieval of related documents in a single query without the use of database join operations.