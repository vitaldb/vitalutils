# return list
# TODO: r does not support unsigned 4 byte integer
load_vital <- function (path) {
  f <- gzfile(path, "rb")
  
  #nrec <- 0
  blksize <- 1000
    
  # header
  sign <- rawToChar(readBin(f, "raw", n=4))
  if ("VITA" != sign) return()
  ver <- readBin(f, "raw", n=4)
  headerlen <- readBin(f, "integer", signed=F, size=2)
  if (headerlen < 10) return()
  
  tzbias <- readBin(f, "integer", signed=F, size=2) * 60 # in second
  inst_id <- readBin(f, "integer", size=4)
  prog_Ver <- readBin(f, "integer", size=4)
  if (headerlen > 10) readBin(f, "raw", n=headerlen-10)
  
  # body
  devs <- list("0" = "") # did -> device names
  trks <- list()
  dtstart <- 4e9
  dtend <- 0
  while(T) {
    type <- readBin(f, "integer", signed=F, size=1)
    if (length(type) == 0) break
    
    datalen <- readBin(f, "integer", size=4)
    if (length(datalen) == 0) break
    
    #nrec <- nrec + 1
    #print(c(nrec, type, datalen))
    
    if (type == 9) { # device info
      if (datalen < 4) {
        readBin(f, "raw", n=datalen)
        next
      }
      did <- as.character(readBin(f, "integer", size=4))
      datalen <- datalen - 4
      
      if (datalen < 4) {
        readBin(f, "raw", n=datalen)
        next
      }
      strlen <- readBin(f, "integer", size=4)
      datalen <- datalen - 4
      
      if (datalen < strlen) {
        readBin(f, "raw", n=datalen)
        next
      }
      typename <- rawToChar(readBin(f, "raw", n=strlen))
      datalen <- datalen - strlen
      
      # optional properties
      devname <- typename
      if (datalen >= 4) {
        strlen <- readBin(f, "integer", size=4)
        datalen <- datalen - 4
        
        if (datalen >= 4) {
          devname <- rawToChar(readBin(f, "raw", n=strlen))
          datalen <- datalen - strlen
        }
      }
      
      devs[[did]] = devname
    } else if (type == 0) { # track info
      if (datalen < 2) {
        readBin(f, "raw", n=datalen)
        next
      }
      tid <- as.character(readBin(f, "integer", signed=F, size=2))
      datalen <- datalen - 2
      
      if (datalen < 1) {
        readBin(f, "raw", n=datalen)
        next
      }
      type <- readBin(f, "integer", signed=F, size=1)
      datalen <- datalen - 1
      
      if (datalen < 1) {
        readBin(f, "raw", n=datalen)
        next
      }
      fmt <- readBin(f, "integer", signed=F, size=1)
      datalen <- datalen - 1
      
      fmttype <- "integer"
      fmtlen <- 1
      if (fmt == 1 || fmt == 2) {
        fmttype <- "double"
      } 
      
      if (fmt == 5 || fmt == 6) {
        fmtlen <- 2
      } else if (fmt == 1 || fmt == 7 || fmt == 8) {
        fmtlen <- 4
      } else if (fmt == 2) {
        fmtlen < -8
      }
      
      if (datalen < 4) {
        readBin(f, "raw", n=datalen)
        next
      }
      strlen <- readBin(f, "integer", size=4)
      datalen <- datalen - 4
      
      if (datalen < strlen) {
        readBin(f, "raw", n=datalen)
        next
      }
      name <- rawToChar(readBin(f, "raw", n=strlen))
      datalen <- datalen - strlen
      
      # optional properties
      unit <- ""
      minval <- 0
      maxval <- 1
      color <- 0
      srate <- 0
      gain <- 1
      offset <- 0
      montype <- 0
      did <- 0
      if (datalen >= 4) {
        strlen <- readBin(f, "integer", size=4)
        datalen <- datalen - 4
        
        if (datalen >= strlen) {
          unit <- rawToChar(readBin(f, "raw", n=strlen))
          datalen <- datalen - strlen
          
          if (datalen >= 4) {
            minval <- readBin(f, "double", size=4)
            datalen <- datalen - 4
            
            if (datalen >= 4) {
              maxval <- readBin(f, "double", size=4)
              datalen <- datalen - 4
              
              if (datalen >= 4) {
                color <- readBin(f, "raw", n=4)
                datalen <- datalen - 4
                
                if (datalen >= 4) {
                  srate <- readBin(f, "double", size=4)
                  datalen <- datalen - 4
                  
                  if (datalen >= 8) {
                    gain <- readBin(f, "double", size=8)
                    datalen <- datalen - 8
                    
                    if (datalen >= 8) {
                      offset <- readBin(f, "double", size=8)
                      datalen <- datalen - 8
                      
                      if (datalen >= 1) {
                        montype <- readBin(f, "integer", signed=F, size=1)
                        datalen <- datalen - 1
                        
                        if (datalen >= 4) {
                          did <- as.character(readBin(f, "integer", size=4))
                          datalen <- datalen - 4
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      trks[[tid]] = list("name"=name, "type"=type, "unit"=unit, 
                         "minval"=minval, "maxval"=maxval, "srate"=srate, 
                         "gain"=gain, "offset"=offset, 
                         "montype"=montype, "did"=did, 
                         "fmttype"=fmttype, "fmtlen"=fmtlen, 
                         "dts"=rep(NA,blksize), 
                         "vals"=vector(mode="list", blksize),
                         "nrec"=0)
    } else if (type == 1) { # rec
      infolen <- readBin(f, "integer", signed=F, size=2)
      datalen <- datalen - 2
      
      dt <- readBin(f, "double", size=8)
      datalen <- datalen - 8
      
      tid <- as.character(readBin(f, "integer", signed=F, size=2))
      datalen <- datalen - 2
      
      if (!is.null(trks[[tid]])) { # track should exist
        type <- trks[[tid]]$type
        nrec <- trks[[tid]]$nrec + 1
        if (nrec <= blksize) {
          trks[[tid]]$dts[nrec] <- dt
          if(type == 1) { # wav
            nsamp <- readBin(f, "integer", size=4)
            datalen <- datalen - 4
            
            #trks[[tid]]$vals[nrec] <- readBin(f, trks[[tid]]$fmttype, size=trks[[tid]]$fmtlen, n=nsamp)
            #datalen <- datalen - trks[[tid]]$fmtlen * nsamp
          } else if (type == 2) { # num
            trks[[tid]]$vals[nrec] <- readBin(f, trks[[tid]]$fmttype, size=trks[[tid]]$fmtlen)
            datalen <- datalen - trks[[tid]]$fmtlen
          } else if (type == 5) { # str
            readBin(f, "raw", n=4)
            datalen <- datalen - 4
            
            strlen <- readBin(f, "integer", size=4)
            datalen <- datalen - 4
            
            trks[[tid]]$vals[nrec] <- rawToChar(readBin(f, "raw", n=strlen))
            datalen <- datalen - strlen
          }
          trks[[tid]]$nrec <- nrec
        }
      }
    } else if (type == 6) { # cmd
    }
  
    readBin(f, "raw", n=datalen)
  }
  
  # convert dts, vals to dataframe
  for (tid in names(trks)) {
    nrec = trks[[tid]]$nrec
    trks[[tid]]$recs <- data.frame(dt=trks[[tid]]$dts[1:nrec], val=trks[[tid]]$vals[1:nrec])
    #trks[[tid]]$dts <- NULL
    #trks[[tid]]$vals <- NULL
    #trks[[tid]]$nrec <- NULL
  }
  
  close(f)
  return(list("devs"=devs, "trks"=trks, "dtstart"=dtstart, "dtend"=dtend))
}

dtstart <- Sys.time()
vit <- load_vital("1.vital")
print(Sys.time() - dtstart)
