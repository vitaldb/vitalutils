/* 
 * Extract file info (dtstart, dtend, track lists)
 * Save (filename, vrcode, file info) to db
 * 
 * @param: file
 * @return dtstart, dtend, track lists
 * 
 * 테스트 결과
 * 압축 푸는데 2초 걸림
 * parsing 1초 걸림
 * total 3초 걸림
 * 
 */
exports.handler = function(event, context, callback){
    var gz_data = null;
    var gz_pos = 0;
    var dtstart = 0, dtend = 0;
    var devs = new Map();
    var trks = new Map();
    var dids = [];
    
    function parse_data(data) {
        if (gz_data === null) {
            gz_data = data;
            var sign = gz_data.toString('utf8', 0, 4);
            if (sign != "VITA") {
                rs.close();
                return;
            }
            gz_pos = 20;
        } else{
            var buf_len = gz_data.length + data.length;
            gz_data = Buffer.concat([gz_data, data], buf_len);
        } 
    
        data = null;
        while(gz_pos + 5 <= gz_data.length) {
            var type = gz_data[gz_pos];
            var data_len = gz_data.readUIntLE(gz_pos + 1);
            if (gz_data.length < gz_pos + data_len + 5){
                return;
            }
            gz_pos += 5;
            var data_pos = gz_pos;
    
            if(type == 0){ // trkinfo (track name, device id)
                gz_pos += 4; // skipping unncessary data
                
                var tname_len = gz_data.readUIntLE(gz_pos); 
                gz_pos += 4;
    
                var tname = gz_data.toString('utf8', gz_pos, gz_pos + tname_len);
                gz_pos += tname_len;
    
                gz_pos += 4 + gz_data.readUIntLE(gz_pos);
    
                gz_pos += 33; // skipping unncessary data
    
                var did = gz_data.readUIntLE(gz_pos);
                gz_pos += 4;
    
                trks[did] = trks[did] || [];
    
                if(!trks[did].includes(tname)) trks[did].push(tname);
                if(!dids.includes(did)) dids.push(did);
            }
            else if(type == 9){ // devinfo (device id, device name)
                var did = gz_data.readUIntLE(gz_pos);
                gz_pos += 4;
    
                gz_pos += 4 + gz_data.readUIntLE(gz_pos);
    
                var dname_len = gz_data.readUIntLE(gz_pos);
                gz_pos += 4;
    
                var dname = gz_data.toString('utf8', gz_pos, gz_pos + dname_len);
                devs[did] = dname;
            }
            else if(type == 1){ // rec (dtstart, dtend)
                gz_pos += 2;
                var dt = gz_data.readDoubleLE(gz_pos);
        
                if(dtstart == 0) dtstart = dt;
                else if (dtstart > dt) dtstart = dt;
                if(dtend < dt) dtend = dt;
            }
            else if(type == 6 && gz_data[gz_pos] == 5) {
                var cnt = gz_data.readUInt16LE(gz_pos + 1);
                if(data_pos + (cnt + 1) * 2 + 1 > gz_data.length){
                    gz_pos -= 5;
                    return;
                }
                gz_pos = data_pos + (cnt + 1) * 2 + 1;
                continue;
            }
            gz_pos = data_pos + data_len;
        }
    }
    
    var zlib = require('zlib');
    var AWS = require('aws-sdk');
    var s3 = new AWS.S3();

    var mysql = require('mysql');
    var db_config = require("./db_config.js");
    var con = mysql.createConnection({
        host: db_config.db_host,
        user: db_config.db_user,
        password: db_config.db_pswd,
        database: db_config.db_name,
    });
    var bucket = event.Records[0].s3.bucket.name;
    var key = event.Records[0].s3.object.key;
    var fsize = event.Records[0].s3.object.size;
    var userid = key.split("/")[0];
    var filename = key.split("/")[1];
    var params = {Bucket: bucket, Key: key};

    s3.getObject(params)
    .createReadStream()
    .pipe(zlib.createGunzip())
    .on ('data', parse_data).on('end', function(){
        var res = "";
        res += "#dtstart=" + dtstart + "," + "#dtend=" + dtend;
        var strks = "";
        for(var i = 0; i < dids.length - 1; i++){
            var tlist = trks[dids[i]];
            for(var j = 0; j < tlist.length; j++) strks += devs[dids[i]] + "/" + tlist[j] + ",";
        }
        var did = dids[dids.length - 1];
        var tlist = trks[did];
        strks += devs[did] + "/" + tlist[tlist.length - 1];

        console.log(res + "," + strks);
        con.connect(function(err1){
            if(err1) throw err1;
            var query = "SELECT * FROM VCASE WHERE filename=\"" + filename + "\" AND userid=\"" + userid + "\"";
            con.query(query, function(err2, result){
                if(err2) throw err2;
                if(result.length == 0) {
                    query = "INSERT INTO VCASE SET filename=\"" + filename + "\",userid=\"" + userid + "\",size=\"" + fsize + "\",dtstart=\"" + dtstart + "\",dtend=\"" + dtend + "\",trks=\"" + strks + "\"";
                    con.query(query, function (err3, result){
                        if(err3) throw err3;
                        console.log(result.affectedRows + " record(s) updated");
                    });
                } else {
                    query = "UPDATE VCASE SET dtstart=\"" + dtstart + "\",dtend=\"" + dtend + "\",trks=\"" + strks + "\",size=\"" + fsize + "\" WHERE filename=\"" + filename + "\" AND userid=\"" + userid + "\"";
                    con.query(query, function (err4, result){
                        if(err4) throw err4;
                        console.log(result.affectedRows + " record(s) updated");
                    });
                }
            });
        });
    }).on('error', function(err){
        console.log(err);
    });
}