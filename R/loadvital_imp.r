# return list
# TODO: r doesnt support unsigned 4 byte integer
load_vital <- function (path) {
  f <- gzfile(path, "rb")
  
  # header
  sign <- rawToChar(readBin(f, "raw", 4))
  if ("VITA" != sign) return()
  ver <- readBin(f, "raw", n=4)
  headerlen <- readBin(f, "integer", signed=F, size=2)
  if (headerlen < 10) return()
  tzbias <- readBin(f, "integer", signed=F, size=2) * 60 # in second
  inst_id <- readBin(f, "integer", size=4)
  prog_Ver <- readBin(f, "integer", size=4)
  readBin(f, "raw", n=headerlen-10)

  # body
  devs <- list("0" = "") # did -> device names
  trks <- list()
  dtstart <- 4e9
  dtend <- 0
  while(T) {
    len <- 5
    type <- readBin(f, "integer", signed=F, size=1)
    if (length(type) == 0) break
    datalen <- readBin(f, "integer", size=4)
    if (length(datalen) == 0) break
    #print(c(type, datalen))
    
    if (type == 9) { # device info
      did <- as.character(readBin(f, "integer", size=4)); datalen <- datalen - 4
      strlen <- readBin(f, "integer", size=4); datalen <- datalen - 4
      typename <- rawToChar(readBin(f, "raw", n=strlen)); datalen <- datalen - strlen
      strlen <- readBin(f, "integer", size=4); datalen <- datalen - 4
      devname <- rawToChar(readBin(f, "raw", n=strlen)); datalen <- datalen - strlen
      devs[[did]] = devname
    } else if (type == 0) { # track info
      tid <- as.character(readBin(f, "integer", signed=F, size=2)); datalen <- datalen - 2
      type <- readBin(f, "integer", signed=F, size=1); datalen <- datalen - 1
      fmt <- readBin(f, "integer", signed=F, size=1); datalen <- datalen - 1
      
      fmttype <- "integer"
      fmtlen <- 1
      if (fmt == 1 || fmt == 2) fmttype <- "double"
      if (fmt == 5 || fmt == 6) fmtlen <- 2
      else if (fmt == 1 || fmt == 7 || fmt == 8) fmtlen <- 4
      else if (fmt == 2) fmtlen < -8
      
      strlen <- readBin(f, "integer", size=4); datalen <- datalen - 4
      name <- rawToChar(readBin(f, "raw", n=strlen)); datalen <- datalen - strlen
      strlen <- readBin(f, "integer", size=4); datalen <- datalen - 4
      unit <- rawToChar(readBin(f, "raw", n=strlen)); datalen <- datalen - strlen
      minval <- readBin(f, "double", size=4); datalen <- datalen - 4
      maxval <- readBin(f, "double", size=4); datalen <- datalen - 4
      color <- readBin(f, "raw", n=4); datalen <- datalen - 4
      srate <- readBin(f, "double", size=4); datalen <- datalen - 4
      gain <- readBin(f, "double", size=8); datalen <- datalen - 8
      offset <- readBin(f, "double", size=8); datalen <- datalen - 8
      montype <- readBin(f, "integer", signed=F, size=1); datalen <- datalen - 1
      did <- as.character(readBin(f, "integer", size=4)); datalen <- datalen - 4
      trks[[tid]] = list("name"=name, "type"=type, "unit"=unit, "minval"=minval, "maxval"=maxval, "srate"=srate, "gain"=gain, "offset"=offset, "montype"=montype, "did"=did, "recs"=list(), "fmttype"=fmttype, "fmtlen"=fmtlen)
    } else if (type == 1) { # rec
      infolen <- readBin(f, "integer", signed=F, size=2); datalen <- datalen - 2
      dt <- readBin(f, "double", size=8); datalen <- datalen - 8
      tid <- as.character(readBin(f, "integer", signed=F, size=2)); datalen <- datalen - 2
      if (!is.null(trks[[tid]])) { # track should exist
        type <- trks[[tid]]$type
        if(type == 1) { # wav
          nsamp <- readBin(f, "integer", size=4); datalen <- datalen - 4
          datalen <- datalen - trks[[tid]]$fmtlen * nsamp
          trks[[tid]]$recs <- c(trks[[tid]]$recs, list("dt"=dt, "vals"=readBin(f, trks[[tid]]$fmttype, size=trks[[tid]]$fmtlen, n=nsamp)))
        } else if (type == 2) { # num
          val <- readBin(f, trks[[tid]]$fmttype, size=trks[[tid]]$fmtlen); datalen <- datalen - trks[[tid]]$fmtlen
          trks[[tid]]$recs <- c(trks[[tid]]$recs, list("dt"=dt, "val"=val))
        } else if (type == 5) { # str
          readBin(f, "raw", n=4); datalen <- datalen - 4
          strlen <- readBin(f, "integer", size=4); datalen <- datalen - 4
          str <- rawToChar(readBin(f, "raw", n=strlen)); datalen <- datalen - strlen
          trks[[tid]]$recs <- c(trks[[tid]]$recs, list("dt"=dt, "val"=str))
        }
      }
    } else if (type == 6) { # cmd
    }

    readBin(f, "raw", n=datalen)
  }
  
  close(f)
  return(list("devs" = devs, "trks" = trks, "dtstart" = dtstart, "dtend" = dtend))
}

vit <- load_vital("1.vital")
print(str(vit))
