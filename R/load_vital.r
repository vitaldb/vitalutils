load_vital <- function (path, interval=1) {
  cmd <- paste0("vital_recs.exe -h ", path, " ", interval)
  return (read.csv(pipe(cmd)))
}

# load vital file and get samples at 1 sec interval
vit <- load_vital("1.vital", 1)

# print maximum arterial pressure
print(max(vit$SNUADC.ART1, na.rm=TRUE))
