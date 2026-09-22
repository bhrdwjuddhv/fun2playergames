import mongoose from 'mongoose'
import {dbName,DB_URI} from '../constants.js'


const connectDb = async () => {
    try{
        // FIX:
        // Building the URL by hand (`${DB_URI}/${dbName}`) breaks when the
        // URI has options at the end (e.g. Atlas: "...mongodb.net/?retryWrites=true").
        // Passing dbName as an option always works.
        await mongoose.connect(DB_URI, { dbName })
        console.log('✅Connected to MongoDB')
    }catch(e){
        console.log("❌ MongoDB Connection Error",e)
        process.exit(1)
    }
}

export default connectDb;
