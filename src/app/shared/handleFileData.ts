import multer from "multer";



const path = require("path");
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, process.cwd() + "/uploads/");
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const extension = path.extname(file.originalname);
        cb(null, file.originalname + "-" + uniqueSuffix + extension);
    },
});

export const handleFileData = multer({ storage: storage });


export const getOriginalFileName = (multerFileName: string) => {

    return multerFileName.split('-')[0];
}